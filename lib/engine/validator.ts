import type { IcpParams } from "@/lib/engine/types";
import { normalizeForQuote } from "@/lib/engine/quoteCheck";

export interface DraftInput {
  subject: string;
  body: string;
  hook_evidence_id: string | null;
  claim_ids: string[];
  pain_code: string | null;
}

export interface ValidatorContext {
  company_name: string;
  poc_first_name: string;
  poc_last_name?: string | null;
  evidence_ids: string[];
  /** All numbers that appear in this company's evidence (quotes/values). */
  evidence_numbers: number[];
  /** Concatenated evidence text, for proper-noun checks. */
  evidence_text: string;
  allowed_claim_numbers: number[];
  /** Sender/signature name, allowed as a proper noun in the signature. */
  sender_name?: string;
}

export interface ValidatorResult {
  ok: boolean;
  checks: Record<string, { ok: boolean; detail?: string }>;
  failures: string[];
}

const BANNED = [
  "i hope this email finds you well",
  "just checking in",
  "touching base",
  "revolutionary",
  "game-changer",
  "game changer",
  "synergy",
  "as we discussed",
];

const FRAMEWORK_RE =
  /\b(soc ?2(?: type (?:i{1,3}|1|2))?|iso ?\d{4,5}|pci[- ]?dss|iso ?42001|iso ?27001|iso ?27701)\b/gi;

// Capitalized tokens that are fine to see at a sentence start or in normal prose.
const COMMON_CAPS = new Set(
  [
    "Hi","Hello","Hey","Thanks","Thank","Would","Happy","Teams","Your","Saw","I","We","Our","The","That","This","A","An","And","But","So","If","It","They","You","Not","Reply","Best","Regards","Cheers","Kind","Dear","Right","After","With","From","For","To","On","At","In","Of","As","Is","Are","Was","Were","Most","Many","Some","Few","Series","Growth","Lead","Sprinto",
    "Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday",
    "January","February","March","April","May","June","July","August","September","October","November","December",
    "US","USA","EU","UK","AWS","GCP","Azure","SaaS","AI","IT","HR","GRC","CISO","CTO","CEO","DPO","VP","SSO","Q1","Q2","Q3","Q4",
    "SOC","ISO","GDPR","HIPAA","PCI","DSS","DPDP","Type",
  ].map((s) => s),
);

function words(s: string): string[] {
  return s.trim().split(/\s+/).filter(Boolean);
}

/** numbers excluding those inside framework names and the CTA duration. */
function extractNumbers(text: string, ctaMinutes: number): number[] {
  const stripped = text.replace(FRAMEWORK_RE, " ").replace(/\bQ[1-4]\b/gi, " ");
  const nums = (stripped.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) =>
    parseFloat(n.replace(/,/g, "")),
  );
  // remove one occurrence of the CTA duration
  const out: number[] = [];
  let ctaSkipped = false;
  for (const n of nums) {
    if (!ctaSkipped && n === ctaMinutes) {
      ctaSkipped = true;
      continue;
    }
    out.push(n);
  }
  return out;
}

export function validateDraft(
  d: DraftInput,
  ctx: ValidatorContext,
  icp: IcpParams,
): ValidatorResult {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};
  const subject = d.subject ?? "";
  const body = d.body ?? "";
  const full = `${subject}\n${body}`;
  const nFull = normalizeForQuote(full);

  // V1 first name match (greeting uses the first name exactly).
  checks.V1 = {
    ok: new RegExp(`\\b${escapeRe(ctx.poc_first_name)}\\b`).test(body),
    detail: `first name "${ctx.poc_first_name}"`,
  };

  // V2 company name present
  checks.V2 = { ok: nFull.includes(normalizeForQuote(ctx.company_name)) };

  // V3 hook_evidence_id exists and belongs to this company
  checks.V3 = {
    ok: !!d.hook_evidence_id && ctx.evidence_ids.includes(d.hook_evidence_id),
    detail: d.hook_evidence_id ?? "missing",
  };

  // V4 numbers traceable to evidence or allowed claims
  const nums = extractNumbers(full, icp.email.cta_minutes);
  const allowed = new Set([...ctx.evidence_numbers, ...ctx.allowed_claim_numbers]);
  const badNums = nums.filter((n) => !allowed.has(n));
  checks.V4 = { ok: badNums.length === 0, detail: badNums.length ? `unverified: ${badNums.join(", ")}` : undefined };

  // V5 proper nouns must be known (prevents invented customers)
  const allowList = new Set<string>();
  [ctx.company_name, ctx.poc_first_name, ctx.poc_last_name ?? "", "Sprinto", ctx.sender_name ?? ""].forEach(
    (x) => x.split(/\s+/).forEach((w) => allowList.add(w)),
  );
  const evNorm = normalizeForQuote(ctx.evidence_text);
  const sentences = body.split(/(?<=[.!?])\s+/);
  const suspicious: string[] = [];
  for (const sent of sentences) {
    const toks = sent.split(/\s+/);
    toks.forEach((tokRaw, i) => {
      const tok = tokRaw.replace(/[^A-Za-z0-9&-]/g, "");
      if (!tok || tok.length < 2) return;
      if (!/^[A-Z]/.test(tok)) return;
      if (i === 0) return; // sentence-initial words are allowed
      if (COMMON_CAPS.has(tok)) return;
      if (allowList.has(tok)) return;
      if (FRAMEWORK_RE.test(tokRaw)) {
        FRAMEWORK_RE.lastIndex = 0;
        return;
      }
      if (evNorm.includes(normalizeForQuote(tok))) return;
      suspicious.push(tok);
    });
  }
  checks.V5 = {
    ok: suspicious.length === 0,
    detail: suspicious.length ? `unknown proper nouns: ${[...new Set(suspicious)].join(", ")}` : undefined,
  };

  // Body without the opt-out/footer line (R2/R7 exclude signature + footer).
  const OPTOUT_RE = /reply ['"]?no['"]?|opt[- ]?out|won['’]t follow up|not relevant/i;
  const bodyCore = body
    .split(/\n/)
    .filter((l) => !OPTOUT_RE.test(l))
    .join("\n");

  // V6 word/subject limits
  const subjWords = words(subject).length;
  const bodyWords = words(bodyCore).length;
  checks.V6 = {
    ok:
      subjWords <= icp.email.subject_max_words &&
      bodyWords >= icp.email.body_min_words &&
      bodyWords <= icp.email.body_max_words,
    detail: `subject ${subjWords}w, body ${bodyWords}w`,
  };

  // V7 banned phrases (+ R1/R9 subject rules)
  const lc = nFull;
  const banned = BANNED.filter((b) => lc.includes(b));
  const subjClickbait =
    subject.includes("!") ||
    /^(re:|fwd:)/i.test(subject.trim()) ||
    subject === subject.toUpperCase() && /[A-Z]{4,}/.test(subject) ||
    /quick question/i.test(subject);
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(full)) banned.push("emoji");
  if (subjClickbait) banned.push("subject-rule");
  checks.V7 = { ok: banned.length === 0, detail: banned.length ? banned.join(", ") : undefined };

  // V8 exactly one "?" or one call CTA (opt-out footer excluded)
  const q = (bodyCore.match(/\?/g) ?? []).length;
  const hasCall = /\b\d+\s?minutes?\b|\bcall\b|\bchat\b|\bwalk (you )?through\b/i.test(bodyCore);
  checks.V8 = {
    ok: q === 1 || (q === 0 && hasCall),
    detail: `? count ${q}, call CTA ${hasCall}`,
  };

  // V9 opt-out present
  checks.V9 = {
    ok: /reply ['"]?no['"]?|opt[- ]?out|won['’]t follow up|not relevant/i.test(body),
  };

  const failures = Object.entries(checks)
    .filter(([, v]) => !v.ok)
    .map(([k]) => k);

  return { ok: failures.length === 0, checks, failures };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
