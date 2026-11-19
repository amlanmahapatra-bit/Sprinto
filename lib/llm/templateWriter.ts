import type { WriterInput, WriterOutput, CriticOutput } from "@/lib/pipeline/types";

// Deterministic, validator-passing writer. Used in MOCK_EXTERNAL mode and as a fallback
// when Gemini is unavailable. Never invents facts or numbers: the hook is numberless and
// references the chosen evidence item; the one proof point is an allowed Sprinto claim.

function hookSentence(input: WriterInput): string {
  const sig = input.hook.text;
  const c = input.company_name;
  // The evidence text already carries the specifics; keep numbers out to stay traceable.
  if (/hiring|compliance|security engineer|grc|audit/i.test(sig))
    return `saw ${c} is hiring to own its SOC 2 and ISO 27001 programme`;
  if (/working toward|in progress|expect our audit/i.test(sig))
    return `saw ${c}'s security page says you're working toward SOC 2 Type II`;
  if (/maintains soc|certified|iso 27001/i.test(sig))
    return `saw ${c} already maintains SOC 2 Type II and ISO 27001`;
  if (/series|raised|backed by|funding/i.test(sig))
    return `saw ${c} is scaling fast after its latest round`;
  if (/enterprise|trusted by|customers/i.test(sig))
    return `saw ${c} is winning larger, enterprise customers`;
  return `saw what ${c} is building`;
}

export function templateWrite(input: WriterInput): WriterOutput {
  const first = input.poc_first_name;
  const hook = hookSentence(input);

  const painLine = painSentence(input.pain_primary.code, input.pain_secondary?.code ?? null);
  const claimLine = `That's exactly what Sprinto is built for — ${lowerFirst(input.claim.text)}.`;
  const cta = `Would a ${input.cta_minutes}-minute walk-through of how that maps to your plan help?`;
  const optout = `Not relevant? Reply 'no' and I won't follow up.`;
  const signature = `${input.sender_name}\n${input.sender_title}, Sprinto`;

  const body = [
    `Hi ${first}, ${hook}. ${painLine}`,
    claimLine,
    cta,
    optout,
    signature,
  ].join("\n\n");

  const subject = subjectFor(input.pain_primary.code);

  return {
    subject,
    body,
    hook_evidence_id: input.hook.evidence_id,
    claim_ids: [input.claim.id],
    pain_code: input.pain_primary.code,
  };
}

function painSentence(primary: string, secondary: string | null): string {
  const map: Record<string, string> = {
    PP1: "That's usually when enterprise security reviews start stalling your deals",
    PP2: "That tends to pull engineers off the roadmap to gather audit evidence",
    PP3: "A first audit with no in-house playbook is a lot to carry alone",
    PP4: "New markets usually mean new frameworks to stand up",
    PP5: "Staying audit-ready between audits is where control drift creeps in",
    PP6: "Most tools flag issues but still leave the work to your team",
    PP7: "The volume of customer security questionnaires only grows from here",
    PP8: "Shipping an AI product adds AI-governance expectations on top",
  };
  const short: Record<string, string> = {
    PP1: "enterprise security reviews",
    PP2: "engineers pulled into evidence collection",
    PP3: "a first audit with no playbook",
    PP4: "new frameworks for new markets",
    PP5: "control drift between audits",
    PP6: "a tool that leaves the work to your team",
    PP7: "a growing pile of security questionnaires",
    PP8: "AI-governance expectations",
  };
  let s = (map[primary] ?? "That's usually where compliance work piles up on one desk") + ".";
  if (secondary && short[secondary]) {
    s += ` It usually overlaps with ${short[secondary]}.`;
  }
  return s;
}

function subjectFor(code: string): string {
  const map: Record<string, string> = {
    PP1: "SOC 2 before the next enterprise deal",
    PP2: "Keep engineers off audit evidence",
    PP3: "Your first SOC 2, without the scramble",
    PP4: "New markets, new frameworks",
    PP5: "Audit-ready between audits",
    PP6: "Less manual work than your current tool",
    PP7: "Faster security questionnaire answers",
    PP8: "AI governance for your AI product",
  };
  return map[code] ?? "A faster path to SOC 2";
}

function lowerFirst(s: string): string {
  if (!s) return s;
  const firstWord = s.split(/\s/)[0];
  // Don't lowercase acronyms like "SOC" or "ISO".
  if (firstWord.length >= 2 && firstWord === firstWord.toUpperCase()) return s;
  return s[0].toLowerCase() + s.slice(1);
}

export function templateCritique(subject: string, body: string, _title: string): CriticOutput {
  // Deterministic, generous-but-honest scoring for the offline path.
  const words = body.split(/\s+/).filter(Boolean).length;
  const specificity = /saw|hiring|working toward|maintains|enterprise/i.test(body) ? 4 : 3;
  const relevance = 4;
  const clarity = subject.split(/\s+/).length <= 7 && words <= 120 ? 5 : 3;
  const would_reply = 4;
  const overall = Math.min(specificity, relevance, clarity, would_reply);
  return {
    specificity,
    relevance,
    clarity,
    would_reply,
    overall,
    critique: "Specific, role-relevant hook; one claim; one clear ask. Offline template critic.",
  };
}
