import type { Adapters, EvidenceItem, ExtractResult, ScrapedPage, WriterInput, WriterOutput, CriticOutput } from "@/lib/pipeline/types";
import type { Signals, ResearchDelta } from "@/lib/engine/types";
import { FIXTURE_PAGES, FIXTURE_NEWS, type FixturePage } from "@/lib/fixtures/pages";
import { fixtureCase, fixtureHunter } from "@/lib/fixtures/data";
import { templateWrite, templateCritique } from "@/lib/llm/templateWriter";
import crypto from "node:crypto";

function hash(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
}

function toScraped(p: FixturePage, iteration = 0): ScrapedPage {
  return {
    url: p.url,
    kind: p.kind,
    content_md: p.content_md,
    http_status: 200,
    fetched_via: "mock",
    content_hash: hash(p.content_md),
    iteration,
  };
}

/** First sentence/line in the page that contains the keyword. */
function findQuote(pages: ScrapedPage[], re: RegExp): { quote: string; url: string } | null {
  for (const p of pages) {
    const parts = p.content_md.split(/\n|(?<=[.!?])\s+/);
    for (const part of parts) {
      const t = part.replace(/^#+\s*/, "").replace(/^[-*]\s*/, "").trim();
      if (t && re.test(t)) return { quote: t.slice(0, 300), url: p.url };
    }
  }
  return null;
}

let evSeq = 0;
function ev(
  criterion: string | null,
  signal: string,
  value: unknown,
  found: { quote: string; url: string } | null,
  iteration: number,
): EvidenceItem | null {
  if (!found) return null;
  evSeq += 1;
  return {
    id: `ev-${signal}-${iteration}-${evSeq}`,
    criterion,
    signal,
    value,
    quote: found.quote,
    source_url: found.url,
    source_kind: "page",
    iteration,
  };
}

function extractEvidence(signals: Signals, pages: ScrapedPage[], iteration: number): EvidenceItem[] {
  const items: (EvidenceItem | null)[] = [];
  if (signals.hiring_compliance_role)
    items.push(ev("C3", "hiring_compliance_role", true, findQuote(pages, /compliance|grc|security engineer|infosec|soc ?2|iso ?27001|audit/i), iteration));
  if (signals.security_in_progress)
    items.push(ev("C3", "security_in_progress", true, findQuote(pages, /working toward|in progress|upcoming audit|expect our audit/i), iteration));
  if (signals.already_certified)
    items.push(ev("C3", "already_certified", true, findQuote(pages, /maintains soc ?2|soc ?2 type ii and iso|certified/i), iteration));
  if (signals.competitor_vendor)
    items.push(ev(null, "competitor_vendor", signals.competitor_vendor, findQuote(pages, /powered by (vanta|drata|secureframe|scrut|safebase)/i), iteration));
  if (signals.enterprise_customers)
    items.push(ev("C5", "enterprise_customers", true, findQuote(pages, /trusted by|enterprise customers?|500\+ employees|first enterprise customer/i), iteration));
  if (signals.customer_count != null)
    items.push(ev("C5", "customer_count", signals.customer_count, findQuote(pages, /\d+\+? (enterprise )?(customers|companies)/i), iteration));
  if (signals.cloud_providers && signals.cloud_providers.length)
    items.push(ev("C7", "cloud_providers", signals.cloud_providers, findQuote(pages, /\b(aws|amazon web services|google cloud|gcp|azure)\b/i), iteration));
  if (signals.funding_stage)
    items.push(ev("C2", "funding_stage", signals.funding_stage, findQuote(pages, /raised a? \$?\d|series [a-d]|backed by/i), iteration));
  if (signals.employees_min != null)
    items.push(ev("C4", "employees", { min: signals.employees_min, max: signals.employees_max }, findQuote(pages, /team of \d+|\d+ people|\d+ employees/i), iteration));
  if (signals.is_saas)
    items.push(ev("C1", "is_saas", true, findQuote(pages, /platform|saas|software|dashboard/i), iteration));
  if (signals.industry)
    items.push(ev("C6", "industry", signals.industry, findQuote(pages, /finance|payroll|hr|logistics|fleet|health|security|platform/i), iteration));
  if (signals.expansion_regions && signals.expansion_regions.length)
    items.push(ev(null, "expansion_regions", signals.expansion_regions, findQuote(pages, /expand into|us (office|mid-market)|new york|expansion/i), iteration));
  return items.filter((x): x is EvidenceItem => x !== null);
}

export const mockAdapters: Adapters = {
  kind: "mock",

  async scrape(domain, iteration = 0) {
    const pages = (FIXTURE_PAGES[domain] ?? []).map((p) => toScraped(p, iteration));
    if (iteration > 0) {
      const news = FIXTURE_NEWS[domain]?.[iteration];
      if (news) pages.push(toScraped(news, iteration));
    }
    return pages;
  },

  async extract(domain, pages, iteration) {
    const c = fixtureCase(domain);
    const signals = (c?.initial_signals ?? emptySignals()) as Signals;
    return {
      company_name: c?.company_name ?? domain,
      signals,
      evidence: extractEvidence(signals, pages, iteration),
      facts: { domain },
      model: "mock",
      prompt_version: "extract.mock",
    };
  },

  async research(domain, iteration, _signals): Promise<ResearchDelta | null> {
    const c = fixtureCase(domain);
    const d = c?.research_deltas?.find((x) => x.iteration === iteration);
    if (!d) return null;
    return { iteration, tool: d.tool ?? "mock", args: d.args ?? {}, signals: d.signals };
  },

  async hunterSearch(domain) {
    return fixtureHunter(domain);
  },

  async write(input: WriterInput): Promise<WriterOutput> {
    return templateWrite(input);
  },

  async critique(subject, body, title): Promise<CriticOutput> {
    return templateCritique(subject, body, title);
  },

  async sendEmail(msg) {
    return { messageId: `mock-${hash(msg.to + Date.now())}`, threadId: `thread-${hash(msg.to)}` };
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
