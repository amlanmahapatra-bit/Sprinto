import { XMLParser } from "fast-xml-parser";
import { z } from "zod";
import { rawQuery } from "@/lib/db/service";
import { env } from "@/lib/env";
import { callJSON } from "@/lib/llm/call";
import { normalizeDomain, domainSchema } from "@/lib/util/domain";

export interface Candidate {
  company: string;
  domain: string | null;
  headline: string;
  date: string | null;
  source: string;
  url: string | null;
}

const QUERIES = [
  { q: '"Series A" SaaS raises', ed: "US" },
  { q: '"Series B" SaaS funding', ed: "US" },
  { q: "SOC 2 startup hiring", ed: "US" },
  { q: '"Series A" SaaS India', ed: "IN" },
];

interface RawItem { title: string; url: string; date: string | null; source: string }

async function rss(query: string, ed: string): Promise<RawItem[]> {
  const edition = ed === "IN" ? "hl=en-IN&gl=IN&ceid=IN:en" : "hl=en-US&gl=US&ceid=US:en";
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&${edition}`;
  try {
    const r = await fetch(url, { headers: { "user-agent": "SprintoOutreachBot/1.0" } });
    if (!r.ok) return [];
    const xml = await r.text();
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);
    const items = parsed?.rss?.channel?.item ?? [];
    return (Array.isArray(items) ? items : [items]).slice(0, 10).map((it: any) => ({
      title: String(it.title ?? ""),
      url: String(it.link ?? ""),
      date: it.pubDate ? new Date(it.pubDate).toISOString() : null,
      source: String(it.source?.["#text"] ?? it.source ?? ""),
    }));
  } catch {
    return [];
  }
}

const CandidateSchema = z.object({
  candidates: z.array(
    z.object({ idx: z.number(), company: z.string(), domain: z.string().nullable() }),
  ),
});

// Any configured LLM provider (OpenRouter or Google) can do the extraction — callJSON routes it.
function hasLlm(): boolean {
  return Boolean(env.OPENROUTER_API_KEY || env.GEMINI_API_KEY);
}

export async function discoverCandidates(): Promise<Candidate[]> {
  const raw: RawItem[] = (await Promise.all(QUERIES.map((x) => rss(x.q, x.ed)))).flat();

  let candidates: Candidate[] = [];
  if (hasLlm() && raw.length) {
    try {
      const { data } = await callJSON({
        model: env.GEMINI_MODEL_FAST,
        step: "discover",
        promptVersion: "discover.v3",
        prompt: `These are numbered news headlines. For each headline about a SPECIFIC SaaS company that just raised funding or is hiring for compliance/security, return the company name and your best guess at its website domain. Infer the domain for every named company — use the real domain if you know it (e.g. Stripe -> "stripe.com", Secureframe -> "secureframe.com"), otherwise a sensible guess such as the company name as a .com. Only use null for domain when the headline is NOT about a single identifiable company (a funding guide, benchmark article, list/roundup, or event). Skip those non-company headlines.\n\n${raw
          .map((r, i) => `${i + 1}. ${r.title}`)
          .join("\n")}\n\nReturn JSON { candidates: [{ idx, company, domain }] } where idx is the headline number.`,
        schema: CandidateSchema,
        thinkingLevel: "low",
      });
      candidates = data.candidates
        .filter((c) => c.idx >= 1 && c.idx <= raw.length)
        .map((c) => {
          const r = raw[c.idx - 1];
          const dom = c.domain ? normalizeDomain(c.domain) : "";
          return {
            company: c.company,
            domain: dom && domainSchema.safeParse(dom).success ? dom : null,
            headline: r.title,
            date: r.date,
            source: r.source,
            url: r.url || null,
          };
        });
    } catch {
      candidates = [];
    }
  }
  if (candidates.length === 0) {
    candidates = raw.map((r) => {
      const m = r.title.match(/^([A-Z][A-Za-z0-9.& ]{1,30}?)\s+(raises|raised|secures|lands|closes|is hiring)/);
      return { company: m?.[1]?.trim() ?? r.title.slice(0, 40), domain: null, headline: r.title, date: r.date, source: r.source, url: r.url || null };
    });
  }

  // Exclude domains contacted in the last 90 days.
  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
  const recent = await rawQuery<{ domain: string }>(
    "select c.domain from sends s join companies c on c.id = s.company_id where s.sent_at >= $1", [since]);
  const contacted = new Set<string>(recent.map((r) => r.domain).filter(Boolean));

  return candidates.filter((c) => !(c.domain && contacted.has(c.domain))).slice(0, 20);
}
