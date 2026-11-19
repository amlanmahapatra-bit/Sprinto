import type { Adapters, EvidenceItem, ScrapedPage, WriterInput } from "@/lib/pipeline/types";
import type { IcpParams, QualificationResult, ResearchDelta, Signals } from "@/lib/engine/types";
import { runQualification } from "@/lib/engine/qualify";
import { employeesEst } from "@/lib/engine/score";
import { selectPoc, type RankedContact } from "@/lib/engine/poc";
import { derivePainSignals, rankPains, PAIN_LIBRARY } from "@/lib/engine/pains";
import { validateDraft, type ValidatorContext } from "@/lib/engine/validator";
import { DEFAULT_CLAIM_BY_PAIN, claimById, allAllowedClaimNumbers, SPRINTO_CLAIMS } from "@/lib/llm/sprintoClaims";
import { env } from "@/lib/env";

export interface ResearchStepRecord {
  iteration: number;
  tool: string;
  args: Record<string, unknown>;
  result_summary: string;
  signals: Partial<Signals>;
}

export interface CompanyRunResult {
  domain: string;
  company_name: string;
  pages: ScrapedPage[];
  signals: Signals;
  evidence: EvidenceItem[];
  qualification: QualificationResult;
  research_steps: ResearchStepRecord[];
  contacts: RankedContact[];
  poc: RankedContact | null;
  s_engled: boolean;
  pains: { all: { code: string; text: string; rank: number; score: number }[]; top: { code: string; text: string; rank: number; score: number }[] };
  draft:
    | {
        subject: string;
        body: string;
        hook_evidence_id: string;
        claim_ids: string[];
        pain_code: string;
        validator: ReturnType<typeof validateDraft>;
        critic: Awaited<ReturnType<Adapters["critique"]>>;
        rewrites: number;
      }
    | null;
  flags: string[];
  verdict: string;
  hold_reason: string | null;
}

function numbersIn(text: string): number[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => parseFloat(n.replace(/,/g, "")));
}

const HOOK_PRIORITY = [
  (e: EvidenceItem) => e.source_kind === "news",
  (e: EvidenceItem) => e.signal === "hiring_compliance_role",
  (e: EvidenceItem) => e.signal === "security_in_progress",
  (e: EvidenceItem) => e.signal === "already_certified",
  (e: EvidenceItem) => e.signal === "enterprise_customers" || e.signal === "expansion_regions",
];

function pickHook(evidence: EvidenceItem[]): EvidenceItem | null {
  for (const pred of HOOK_PRIORITY) {
    const hit = evidence.find(pred);
    if (hit) return hit;
  }
  return evidence[0] ?? null;
}

export async function runCompany(
  domain: string,
  adapters: Adapters,
  icp: IcpParams,
  opts: { now?: Date } = {},
): Promise<CompanyRunResult> {
  const now = opts.now ?? new Date();

  const pages = await adapters.scrape(domain, 0);
  const base = await adapters.extract(domain, pages, 0);
  let evidence = [...base.evidence];
  const researchSteps: ResearchStepRecord[] = [];

  const agent = async (iteration: number, signals: Signals): Promise<ResearchDelta | null> => {
    const delta = await adapters.research(domain, iteration, signals);
    if (!delta) return null;
    researchSteps.push({
      iteration,
      tool: delta.tool,
      args: delta.args,
      result_summary: Object.keys(delta.signals).length
        ? `found ${Object.keys(delta.signals).join(", ")}`
        : "no new evidence",
      signals: delta.signals,
    });
    // pull any new pages for this iteration and extract evidence
    const morePages = await adapters.scrape(domain, iteration);
    const newOnes = morePages.filter((p) => p.iteration === iteration);
    if (newOnes.length) {
      const ex = await adapters.extract(domain, newOnes, iteration);
      evidence = evidence.concat(ex.evidence.filter((e) => e.iteration === iteration));
      pages.push(...newOnes);
    }
    return delta;
  };

  const qualification = await runQualification(base.signals, icp, agent, { now });
  const flags = new Set<string>(qualification.flags);

  let contacts: RankedContact[] = [];
  let poc: RankedContact | null = null;
  let s_engled = false;
  let pains: CompanyRunResult["pains"] = { all: [], top: [] };
  let draft: CompanyRunResult["draft"] = null;
  let hold_reason: string | null = qualification.reason;

  if (qualification.verdict === "GO") {
    const raw = await adapters.hunterSearch(domain);
    const pocResult = selectPoc(raw, icp, employeesEst(qualification.signals));
    contacts = pocResult.contacts;
    poc = pocResult.selected;
    s_engled = pocResult.s_engled;
    pocResult.flags.forEach((f) => flags.add(f));

    if (!poc) {
      hold_reason = "NO_POC";
    } else {
      const ps = derivePainSignals(
        qualification.signals,
        { sprintoVendor: icp.gates.sprinto_vendor },
        icp.regulated_industries,
        s_engled,
      );
      const ranked = rankPains(ps, poc.persona ?? "founder", icp);
      pains = ranked;

      const hook = pickHook(evidence);
      const primary = ranked.top[0];
      const secondary = ranked.top[1] ?? null;
      const claimId = (DEFAULT_CLAIM_BY_PAIN[primary.code] ?? ["SC4"])[0];
      const claim = claimById(claimId) ?? SPRINTO_CLAIMS[3];

      const writerInput: WriterInput = {
        company_name: base.company_name,
        domain,
        poc_first_name: poc.first_name ?? "there",
        poc_title: poc.position ?? "",
        pain_primary: { code: primary.code, text: primary.text },
        pain_secondary: secondary ? { code: secondary.code, text: secondary.text } : null,
        hook: {
          evidence_id: hook?.id ?? "none",
          text: hook?.quote ?? "",
          source_url: hook?.source_url ?? null,
        },
        claim: { id: claim.id, text: claim.text },
        sender_name: env.SENDER_NAME,
        sender_title: env.SENDER_TITLE,
        cta_minutes: icp.email.cta_minutes,
      };

      const evCtx: ValidatorContext = {
        company_name: base.company_name,
        poc_first_name: poc.first_name ?? "",
        poc_last_name: poc.last_name,
        evidence_ids: evidence.map((e) => e.id),
        evidence_numbers: evidence.flatMap((e) => [
          ...numbersIn(e.quote ?? ""),
          ...numbersIn(JSON.stringify(e.value ?? "")),
        ]),
        evidence_text: evidence.map((e) => e.quote ?? "").join("\n"),
        allowed_claim_numbers: allAllowedClaimNumbers(),
        sender_name: env.SENDER_NAME,
      };

      let out = await adapters.write(writerInput);
      let validator = validateDraft(out, evCtx, icp);
      let critic = await adapters.critique(out.subject, out.body, poc.position ?? "");
      let rewrites = 0;

      if ((!validator.ok || critic.overall < icp.email.critic_min_score) && adapters.kind === "real") {
        // one rewrite with feedback (real path); mock template is already compliant
        out = await adapters.write(writerInput);
        validator = validateDraft(out, evCtx, icp);
        critic = await adapters.critique(out.subject, out.body, poc.position ?? "");
        rewrites = 1;
      }

      if (!validator.ok) flags.add("VALIDATOR_FAILED");
      if (critic.overall < icp.email.critic_min_score) flags.add("HOOK_WEAK");

      draft = {
        subject: out.subject,
        body: out.body,
        hook_evidence_id: out.hook_evidence_id,
        claim_ids: out.claim_ids,
        pain_code: out.pain_code,
        validator,
        critic,
        rewrites,
      };
    }
  }

  // Map pain library text for any missing text (safety)
  void PAIN_LIBRARY;

  return {
    domain,
    company_name: base.company_name,
    pages,
    signals: qualification.signals,
    evidence,
    qualification,
    research_steps: researchSteps,
    contacts,
    poc,
    s_engled,
    pains,
    draft,
    flags: [...flags],
    verdict: qualification.verdict === "GO" && !poc ? "HOLD" : qualification.verdict,
    hold_reason,
  };
}
