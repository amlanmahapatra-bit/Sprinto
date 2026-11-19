import type { WriterInput } from "@/lib/pipeline/types";
import { SPRINTO_CLAIMS } from "@/lib/llm/sprintoClaims";

export const PROMPT_VERSIONS = {
  extract: "extract.v1",
  research: "research.v1",
  painRationale: "painRationale.v1",
  write: "write.v1",
  critic: "critic.v1",
} as const;

export function extractPrompt(domain: string, pages: { url: string; content_md: string }[]): string {
  const body = pages
    .map((p) => `--- SOURCE: ${p.url} ---\n${p.content_md.slice(0, 8000)}`)
    .join("\n\n");
  return `You extract structured facts about a company from its own web pages. Return JSON matching the schema.

RULES:
- Return null for any field the pages do not state. Do not guess.
- Every non-null value must include a "quote" copied EXACTLY (verbatim) from the cited page, and the "source_url" it came from.
- Keep quotes under 300 characters.
- certifications_claimed: only frameworks the page says the company HAS (not "working toward").
- in_progress: true only if the page says it is working toward / in progress / upcoming audit.

Company domain: ${domain}

PAGES:
${body}`;
}

export function researchPrompt(domain: string, unknownCriteria: string[], weakCriteria: string[]): string {
  return `You are a research assistant helping qualify ${domain} against an ICP.
These criteria are still unknown: ${unknownCriteria.join(", ") || "none"}.
These criteria scored 0 but could change the verdict: ${weakCriteria.join(", ") || "none"}.

Use Google Search to find PUBLIC, verifiable facts that fill these gaps: funding stage & date, headcount, cloud provider, compliance hiring, enterprise customers, industry, expansion regions.
Only report facts you can attribute to a specific source URL. Summarise what you found and include the source URLs.`;
}

export function painRationalePrompt(
  company: string,
  persona: string,
  pains: { code: string; text: string }[],
  evidence: { id: string; quote: string | null }[],
): string {
  return `Write a 1-2 sentence rationale for why EACH pain below is likely relevant to a ${persona} at ${company}.
Cite evidence ids you actually use. Do not invent facts or numbers; only reference the evidence quotes.

PAINS:
${pains.map((p) => `${p.code}: ${p.text}`).join("\n")}

EVIDENCE:
${evidence.map((e) => `${e.id}: ${e.quote ?? ""}`).join("\n")}

Return JSON: { rationales: [{ code, rationale, evidence_ids: string[] }] }`;
}

export function writePrompt(input: WriterInput): string {
  const claims = SPRINTO_CLAIMS.map((c) => `${c.id}: ${c.text}`).join("\n");
  return `You are the Growth Lead at Sprinto writing a FIRST cold outreach email. Personalised, honest, concise.

HARD RULES:
- Subject <= 7 words. No clickbait, no ALL CAPS, no "Re:"/"Fwd:", no exclamation marks.
- Body 60-120 words (excluding signature and the opt-out line).
- Greet the recipient by first name exactly: "${input.poc_first_name}".
- First sentence is the HOOK and must reference this evidence item (id ${input.hook.evidence_id}): "${input.hook.text}". Do NOT add numbers that aren't in the evidence.
- One pain point: ${input.pain_primary.code} — ${input.pain_primary.text}. ${input.pain_secondary ? `You may add half a sentence on ${input.pain_secondary.code}.` : ""}
- Exactly ONE Sprinto proof point, chosen ONLY from the allowed claims below (word for word or lightly paraphrased without changing numbers).
- One soft CTA (a question, or a ${input.cta_minutes}-minute call). No calendar links.
- Signature: ${input.sender_name}, ${input.sender_title}, Sprinto.
- Opt-out footer line: "Not relevant? Reply 'no' and I won't follow up."
- BANNED: "I hope this email finds you well", "just checking in", "touching base", "revolutionary", "game-changer", "synergy", fake familiarity, invented customers, emojis.

ALLOWED SPRINTO CLAIMS:
${claims}

Company: ${input.company_name} (${input.domain}). Recipient title: ${input.poc_title}.

Return JSON: { subject, body, hook_evidence_id, claim_ids: string[], pain_code }.
Set hook_evidence_id to "${input.hook.evidence_id}" and pain_code to "${input.pain_primary.code}".`;
}

export function criticPrompt(subject: string, body: string, title: string): string {
  return `Score this cold email 1-5 on each: specificity of the hook, relevance to the person's role, clarity of the ask, "would a busy ${title} reply". Then one-paragraph critique.

SUBJECT: ${subject}
BODY:
${body}

Return JSON: { specificity, relevance, clarity, would_reply, critique }.`;
}
