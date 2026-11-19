import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import TurndownService from "turndown";
import { XMLParser } from "fast-xml-parser";
import { promises as dns } from "node:dns";
import crypto from "node:crypto";
import pLimit from "p-limit";
import { z } from "zod";
import type {
  Adapters,
  EvidenceItem,
  ExtractResult,
  ScrapedPage,
  WriterInput,
  WriterOutput,
  CriticOutput,
} from "@/lib/pipeline/types";
import type { CloudProvider, ResearchDelta, Signals } from "@/lib/engine/types";
import { env } from "@/lib/env";
import { callJSON, callText } from "@/lib/llm/call";
import { CompanyFactsSchema, signalsFromFacts } from "@/lib/schemas/companyFacts";
import { quoteFound } from "@/lib/engine/quoteCheck";
import { extractPrompt, researchPrompt, writePrompt, criticPrompt, PROMPT_VERSIONS } from "@/lib/llm/prompts";
import { deliverEmail } from "@/lib/adapters/gmail";

const COMMON_PATHS = [
  "", "about", "company", "pricing", "careers", "jobs", "security", "trust",
  "customers", "case-studies", "press", "blog",
];
const TIMEOUT_MS = 10_000;
const MAX_PAGES = 8;
const MAX_MD = 200_000;

function hash(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
}

async function withTimeout<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ]);
}

async function fetchMarkdown(url: string): Promise<{ md: string; via: string; status: number } | null> {
  // 1) Jina Reader
  try {
    const headers: Record<string, string> = {};
    if (env.JINA_API_KEY) headers.Authorization = `Bearer ${env.JINA_API_KEY}`;
    const r = await withTimeout(fetch(`https://r.jina.ai/${url}`, { headers }));
    if (r.ok) {
      const md = (await r.text()).slice(0, MAX_MD);
      if (md.trim()) return { md, via: "jina", status: 200 };
    }
  } catch {
    /* fall through */
  }
  // 2) plain fetch + Readability + Turndown
  try {
    const r = await withTimeout(fetch(url, { headers: { "user-agent": "SprintoOutreachBot/1.0" } }));
    const status = r.status;
    const html = await r.text();
    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();
    const td = new TurndownService();
    const md = td.turndown(article?.content ?? html).slice(0, MAX_MD);
    return { md, via: "readability", status };
  } catch {
    return null;
  }
}

async function robotsAllows(domain: string): Promise<(path: string) => boolean> {
  try {
    const r = await withTimeout(fetch(`https://${domain}/robots.txt`));
    if (!r.ok) return () => true;
    const txt = await r.text();
    // very small parser: collect Disallow lines under User-agent: *
    const lines = txt.split(/\r?\n/);
    let active = false;
    const disallow: string[] = [];
    for (const line of lines) {
      const l = line.trim();
      if (/^user-agent:/i.test(l)) active = /\*/.test(l);
      else if (active && /^disallow:/i.test(l)) {
        const p = l.split(":")[1]?.trim() ?? "";
        if (p) disallow.push(p);
      }
    }
    return (path: string) => !disallow.some((d) => d !== "" && path.startsWith(d));
  } catch {
    return () => true;
  }
}

async function cloudFromDns(domain: string): Promise<CloudProvider[]> {
  const providers = new Set<CloudProvider>();
  const add = (s: string) => {
    if (/cloudfront\.net|amazonaws\.com|awsdns/i.test(s)) providers.add("aws");
    if (/googleusercontent|appspot|run\.app|googledomains|google/i.test(s)) providers.add("gcp");
    if (/azurewebsites|azureedge|cloudapp\.azure|azure/i.test(s)) providers.add("azure");
  };
  try {
    const cname = await dns.resolveCname(domain).catch(() => []);
    cname.forEach(add);
  } catch { /* ignore */ }
  try {
    const mx = await dns.resolveMx(domain).catch(() => []);
    mx.forEach((m) => add(m.exchange));
  } catch { /* ignore */ }
  try {
    const ns = await dns.resolveNs(domain).catch(() => []);
    ns.forEach(add);
  } catch { /* ignore */ }
  return [...providers];
}

async function discoverPages(domain: string): Promise<{ url: string; kind: string }[]> {
  const out: { url: string; kind: string }[] = [];
  for (const p of COMMON_PATHS) {
    out.push({ url: `https://${domain}/${p}`, kind: p || "home" });
  }
  out.push({ url: `https://trust.${domain}/`, kind: "trust" });
  // sitemap links (same host only)
  try {
    const r = await withTimeout(fetch(`https://${domain}/sitemap.xml`));
    if (r.ok) {
      const xml = await r.text();
      const parsed = new XMLParser().parse(xml);
      const urls: string[] = (parsed?.urlset?.url ?? [])
        .map((u: { loc?: string }) => u.loc)
        .filter(Boolean)
        .slice(0, 20);
      urls.forEach((u) => {
        if (u.includes(domain)) out.push({ url: u, kind: "sitemap" });
      });
    }
  } catch { /* ignore */ }
  // dedupe + cap
  const seen = new Set<string>();
  return out.filter((x) => (seen.has(x.url) ? false : (seen.add(x.url), true))).slice(0, MAX_PAGES);
}

function parseSourceUrl(md: string, fallback: string): string {
  const m = md.match(/source_url:\s*([^\s>]+)/);
  return m?.[1] ?? fallback;
}

function quoteFromEvidenceLeaf(
  quote: string | null,
  sourceUrl: string | null,
  pages: ScrapedPage[],
): boolean {
  if (!quote) return false;
  const page = pages.find((p) => p.url === sourceUrl);
  const corpus = page ? page.content_md : pages.map((p) => p.content_md).join("\n");
  return quoteFound(quote, corpus);
}

const SignalsDeltaSchema = z.object({
  funding_stage: z.string().nullable().optional(),
  funding_date: z.string().nullable().optional(),
  employees_min: z.number().nullable().optional(),
  employees_max: z.number().nullable().optional(),
  enterprise_pressure: z.boolean().nullable().optional(),
  enterprise_customers: z.boolean().nullable().optional(),
  industry: z.string().nullable().optional(),
  cloud_providers: z.array(z.string()).nullable().optional(),
  expansion_regions: z.array(z.string()).nullable().optional(),
});

const WriterSchema = z.object({
  subject: z.string(),
  body: z.string(),
  hook_evidence_id: z.string(),
  claim_ids: z.array(z.string()),
  pain_code: z.string(),
});

const CriticSchema = z.object({
  specificity: z.number(),
  relevance: z.number(),
  clarity: z.number(),
  would_reply: z.number(),
  critique: z.string(),
});

let evSeq = 0;
function mkEvidence(
  criterion: string | null,
  signal: string,
  value: unknown,
  quote: string | null,
  source_url: string | null,
  iteration: number,
): EvidenceItem {
  evSeq += 1;
  return { id: `ev-${signal}-${iteration}-${evSeq}`, criterion, signal, value, quote, source_url, source_kind: "page", iteration };
}

export const realAdapters: Adapters = {
  kind: "real",

  async scrape(domain, iteration = 0) {
    const allows = await robotsAllows(domain);
    const targets = (await discoverPages(domain)).filter((t) => {
      try {
        return allows(new URL(t.url).pathname);
      } catch {
        return true;
      }
    });
    const limit = pLimit(4);
    const pages = await Promise.all(
      targets.map((t) =>
        limit(async () => {
          const res = await fetchMarkdown(t.url);
          if (!res || !res.md.trim()) return null;
          return {
            url: t.url,
            kind: t.kind,
            content_md: res.md,
            http_status: res.status,
            fetched_via: res.via,
            content_hash: hash(res.md),
            iteration,
          } as ScrapedPage;
        }),
      ),
    );
    return pages.filter((p): p is ScrapedPage => p !== null);
  },

  async extract(domain, pages, iteration): Promise<ExtractResult> {
    if (pages.length === 0) {
      return {
        company_name: domain,
        signals: emptySignals(),
        evidence: [],
        facts: {},
        model: env.GEMINI_MODEL_FAST,
        prompt_version: PROMPT_VERSIONS.extract,
      };
    }
    const { data: facts } = await callJSON({
      model: env.GEMINI_MODEL_FAST,
      step: "extract",
      promptVersion: PROMPT_VERSIONS.extract,
      prompt: extractPrompt(domain, pages),
      schema: CompanyFactsSchema,
      thinkingLevel: "low",
    });

    // E1 quote check: null out leaves whose quote isn't in the cited page.
    const evidence: EvidenceItem[] = [];
    const keep = (ok: boolean, c: string | null, sig: string, value: unknown, quote: string | null, url: string | null) => {
      if (ok && value != null && value !== false) evidence.push(mkEvidence(c, sig, value, quote, url, iteration));
      return ok;
    };

    const checks: Array<[boolean, string | null, string, unknown, string | null, string | null]> = [];
    const f = facts;

    if (f.is_saas.value != null)
      checks.push([quoteFromEvidenceLeaf(f.is_saas.quote, f.is_saas.source_url, pages), "C1", "is_saas", f.is_saas.value, f.is_saas.quote, f.is_saas.source_url]);
    if (f.industry.value != null)
      checks.push([quoteFromEvidenceLeaf(f.industry.quote, f.industry.source_url, pages), "C6", "industry", f.industry.value, f.industry.quote, f.industry.source_url]);
    if (f.funding.stage != null)
      checks.push([quoteFromEvidenceLeaf(f.funding.quote, f.funding.source_url, pages), "C2", "funding_stage", f.funding.stage, f.funding.quote, f.funding.source_url]);
    if (f.employees.min != null || f.employees.max != null)
      checks.push([quoteFromEvidenceLeaf(f.employees.quote, f.employees.source_url, pages), "C4", "employees", { min: f.employees.min, max: f.employees.max }, f.employees.quote, f.employees.source_url]);
    if (f.hiring_compliance_role.value != null)
      checks.push([quoteFromEvidenceLeaf(f.hiring_compliance_role.quote, f.hiring_compliance_role.source_url, pages), "C3", "hiring_compliance_role", f.hiring_compliance_role.value, f.hiring_compliance_role.quote, f.hiring_compliance_role.source_url]);
    if (f.security_page.in_progress != null)
      checks.push([quoteFromEvidenceLeaf(f.security_page.quote, f.security_page.url, pages), "C3", "security_in_progress", f.security_page.in_progress, f.security_page.quote, f.security_page.url]);
    if (f.enterprise_pressure.value != null)
      checks.push([quoteFromEvidenceLeaf(f.enterprise_pressure.quote, f.enterprise_pressure.source_url, pages), "C3", "enterprise_pressure", f.enterprise_pressure.value, f.enterprise_pressure.quote, f.enterprise_pressure.source_url]);
    if (f.customers.enterprise_logos.length || f.customers.count_claimed != null)
      checks.push([quoteFromEvidenceLeaf(f.customers.quote, f.customers.source_url, pages), "C5", "enterprise_customers", { logos: f.customers.enterprise_logos, count: f.customers.count_claimed }, f.customers.quote, f.customers.source_url]);
    if (f.cloud.providers.length)
      checks.push([quoteFromEvidenceLeaf(f.cloud.quote, f.cloud.source_url, pages), "C7", "cloud_providers", f.cloud.providers, f.cloud.quote, f.cloud.source_url]);
    if (f.security_page.certifications_claimed.length)
      checks.push([quoteFromEvidenceLeaf(f.security_page.quote, f.security_page.url, pages), "C3", "already_certified", f.security_page.certifications_claimed, f.security_page.quote, f.security_page.url]);

    const failed: string[] = [];
    for (const [ok, c, sig, value, quote, url] of checks) {
      keep(ok, c, sig, value, quote, url);
      if (!ok) failed.push(sig);
    }

    // DNS adds/overrides cloud deterministically (E4/E5).
    const dnsCloud = await cloudFromDns(domain);
    if (dnsCloud.length && !f.cloud.providers.length) {
      f.cloud.providers = dnsCloud;
      evidence.push(mkEvidence("C7", "cloud_providers", dnsCloud, `DNS records indicate ${dnsCloud.join(", ")}`, `dns:${domain}`, iteration));
    }

    const signals = applyQuoteFailures(signalsFromFacts(f), failed);

    return {
      company_name: f.company_name || domain,
      signals,
      evidence,
      facts: f as unknown as Record<string, unknown>,
      model: env.GEMINI_MODEL_FAST,
      prompt_version: PROMPT_VERSIONS.extract,
    };
  },

  async research(domain, iteration, signals): Promise<ResearchDelta | null> {
    const unknown = unknownCriteria(signals);
    if (unknown.length === 0) return null;
    const { text, grounding } = await callText({
      model: env.GEMINI_MODEL_FAST,
      step: "research",
      promptVersion: PROMPT_VERSIONS.research,
      prompt: researchPrompt(domain, unknown, []),
      grounded: true,
    });
    // Parse a signals delta out of the grounded text.
    const { data: delta } = await callJSON({
      model: env.GEMINI_MODEL_FAST,
      step: "research_parse",
      promptVersion: PROMPT_VERSIONS.research,
      prompt: `From these grounded research notes about ${domain}, extract only facts explicitly stated. Return null for anything not stated.\n\nNOTES:\n${text}\n\nReturn JSON for: funding_stage, funding_date, employees_min, employees_max, enterprise_pressure, enterprise_customers, industry, cloud_providers (array), expansion_regions (array).`,
      schema: SignalsDeltaSchema,
      thinkingLevel: "low",
    });
    const sig = coerceDelta(delta);
    if (Object.keys(sig).length === 0) return null;
    return {
      iteration,
      tool: "google_search",
      args: { query: `${domain} funding headcount compliance`, sources: grounding.slice(0, 5) },
      signals: sig,
    };
  },

  async hunterSearch(domain) {
    if (!env.HUNTER_API_KEY) throw new Error("HUNTER_API_KEY missing");
    const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&type=personal&limit=10&api_key=${env.HUNTER_API_KEY}`;
    const r = await withTimeout(fetch(url));
    if (!r.ok) throw new Error(`Hunter ${r.status}`);
    const json = (await r.json()) as { data?: { emails?: any[] } };
    return (json.data?.emails ?? []).map((e) => ({
      email: e.value,
      first_name: e.first_name ?? null,
      last_name: e.last_name ?? null,
      position: e.position ?? null,
      seniority: e.seniority ?? null,
      department: e.department ?? null,
      type: e.type ?? "personal",
      confidence: e.confidence ?? null,
      verification_status: e.verification?.status ?? null,
      source: "hunter" as const,
    }));
  },

  async write(input: WriterInput): Promise<WriterOutput> {
    const { data } = await callJSON({
      model: env.GEMINI_MODEL_WRITER,
      step: "write",
      promptVersion: PROMPT_VERSIONS.write,
      prompt: writePrompt(input),
      schema: WriterSchema,
      thinkingLevel: "high",
    });
    return {
      subject: data.subject,
      body: data.body,
      hook_evidence_id: data.hook_evidence_id || input.hook.evidence_id,
      claim_ids: data.claim_ids.length ? data.claim_ids : [input.claim.id],
      pain_code: data.pain_code || input.pain_primary.code,
    };
  },

  async critique(subject, body, title): Promise<CriticOutput> {
    const { data } = await callJSON({
      model: env.GEMINI_MODEL_FAST,
      step: "critic",
      promptVersion: PROMPT_VERSIONS.critic,
      prompt: criticPrompt(subject, body, title),
      schema: CriticSchema,
      thinkingLevel: "low",
    });
    const overall = Math.min(data.specificity, data.relevance, data.clarity, data.would_reply);
    return { ...data, overall };
  },

  async sendEmail(msg) {
    return deliverEmail(msg);
  },
};

function emptySignals(): Signals {
  return {
    is_saas: null, funding_stage: null, funding_date: null, employees_min: null, employees_max: null,
    hiring_compliance_role: null, security_in_progress: null, enterprise_pressure: null,
    already_certified: null, competitor_vendor: null, enterprise_customers: null, customer_count: null,
    industry: null, cloud_providers: null, ai_product: null, expansion_regions: null,
  };
}

function applyQuoteFailures(signals: Signals, failed: string[]): Signals {
  const s = { ...signals };
  for (const f of failed) {
    if (f === "employees") { s.employees_min = null; s.employees_max = null; }
    else if (f === "funding_stage") { s.funding_stage = null; s.funding_date = null; }
    else if (f === "enterprise_customers") { s.enterprise_customers = null; s.customer_count = null; }
    else if (f in s) (s as unknown as Record<string, unknown>)[f] = null;
  }
  return s;
}

function unknownCriteria(s: Signals): string[] {
  const u: string[] = [];
  if (s.funding_stage == null && s.funding_date == null) u.push("funding");
  if (s.employees_min == null && s.employees_max == null) u.push("headcount");
  if (s.cloud_providers == null) u.push("cloud");
  if (s.enterprise_pressure == null && s.enterprise_customers == null) u.push("enterprise");
  if (s.industry == null) u.push("industry");
  return u;
}

function coerceDelta(d: z.infer<typeof SignalsDeltaSchema>): Partial<Signals> {
  const out: Partial<Signals> = {};
  const validStages = ["pre_seed","seed","series_a","series_b","series_c","series_d_plus","public","acquired","bootstrapped"];
  const validInd = ["fintech","healthtech","hrtech","insurtech","legaltech","edtech","data_ai_infra","devtools","security","martech","logistics","ecommerce_enablement","other_b2b","b2c"];
  if (d.funding_stage && validStages.includes(d.funding_stage)) out.funding_stage = d.funding_stage as Signals["funding_stage"];
  if (d.funding_date) out.funding_date = d.funding_date;
  if (typeof d.employees_min === "number") out.employees_min = d.employees_min;
  if (typeof d.employees_max === "number") out.employees_max = d.employees_max;
  if (typeof d.enterprise_pressure === "boolean") out.enterprise_pressure = d.enterprise_pressure;
  if (typeof d.enterprise_customers === "boolean") out.enterprise_customers = d.enterprise_customers;
  if (d.industry && validInd.includes(d.industry)) out.industry = d.industry as Signals["industry"];
  if (Array.isArray(d.cloud_providers)) {
    const cp = d.cloud_providers.filter((c): c is CloudProvider => ["aws","gcp","azure"].includes(c));
    if (cp.length) out.cloud_providers = cp;
  }
  if (Array.isArray(d.expansion_regions) && d.expansion_regions.length) out.expansion_regions = d.expansion_regions;
  return out;
}
