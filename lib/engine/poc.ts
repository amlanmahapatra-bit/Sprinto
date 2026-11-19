import type { IcpParams } from "@/lib/engine/types";

export type Persona = "security" | "engineering" | "founder" | null;
export type Tier = 1 | 2 | 3 | null;

export interface RankableContact {
  email: string;
  first_name: string | null;
  last_name: string | null;
  position: string | null;
  seniority: string | null;
  department: string | null;
  type: string | null; // personal | generic
  confidence: number | null;
  verification_status: string | null; // valid | invalid | accept_all | unknown | ...
  source: "hunter" | "manual";
}

export interface RankedContact extends RankableContact {
  persona: Persona;
  tier: Tier;
  eligible: boolean;
  ineligible_reason: string | null;
  rank: number | null;
  selection_reason: string | null;
  is_selected: boolean;
}

export interface PocResult {
  contacts: RankedContact[];
  selected: RankedContact | null;
  s_engled: boolean;
  flags: string[]; // POC_LOW_CONFIDENCE, NO_POC
}

const TIER1 =
  /(ciso|chief information security|head of (information )?security|security (lead|manager|director)|vp,? (of )?security|head of (compliance|grc|risk)|compliance (lead|manager|director|officer)|\bdpo\b|data protection officer)/i;
const TIER2 =
  /(cto|chief technology|vp,? (of )?engineering|head of engineering|director of engineering|head of (it|infrastructure|devops|platform)|engineering manager)/i;
const TIER3 = /(co-?founder|founder|ceo|chief executive|managing director)/i;

export function detectPersona(position: string | null): { persona: Persona; tier: Tier } {
  if (!position) return { persona: null, tier: null };
  if (TIER1.test(position)) return { persona: "security", tier: 1 };
  if (TIER2.test(position)) return { persona: "engineering", tier: 2 };
  if (TIER3.test(position)) return { persona: "founder", tier: 3 };
  return { persona: null, tier: null };
}

function seniorityRank(s: string | null): number {
  const v = (s ?? "").toLowerCase();
  if (v === "executive") return 3;
  if (v === "senior") return 2;
  return 1;
}

function tierRoleWord(tier: Tier): string {
  if (tier === 1) return "security leader";
  if (tier === 2) return "engineering/IT leader";
  return "founder";
}

export function selectPoc(
  raw: RankableContact[],
  icp: IcpParams,
  employeesEst: number | null,
): PocResult {
  const contacts: RankedContact[] = raw.map((c) => {
    const { persona, tier } = detectPersona(c.position);
    let eligible = true;
    let ineligible_reason: string | null = null;

    if (tier == null) {
      eligible = false;
      ineligible_reason = "not a target persona";
    } else if ((c.type ?? "personal") !== "personal") {
      eligible = false;
      ineligible_reason = `type ${c.type}`;
    } else if (!c.first_name) {
      eligible = false;
      ineligible_reason = "no first name";
    } else if (c.confidence != null && c.confidence < icp.poc.min_confidence) {
      eligible = false;
      ineligible_reason = `confidence ${c.confidence} < ${icp.poc.min_confidence}`;
    } else if ((c.verification_status ?? "").toLowerCase() === "invalid") {
      eligible = false;
      ineligible_reason = "verification invalid";
    }

    return {
      ...c,
      persona,
      tier,
      eligible,
      ineligible_reason,
      rank: null,
      selection_reason: null,
      is_selected: false,
    };
  });

  // S_ENGLED: no security-persona contact at all (eligible or not).
  const s_engled = !contacts.some((c) => c.persona === "security");

  const eligible = contacts.filter((c) => c.eligible && c.tier != null);
  const hasEligibleTier1 = eligible.some((c) => c.tier === 1);
  const founderException =
    employeesEst != null &&
    employeesEst < icp.poc.founder_exception_headcount &&
    !hasEligibleTier1;

  const orderKey = (tier: Tier): number => {
    if (founderException) return tier === 1 ? 1 : tier === 3 ? 2 : 3;
    return tier ?? 99;
  };

  eligible.sort((a, b) => {
    const ok = orderKey(a.tier) - orderKey(b.tier);
    if (ok !== 0) return ok;
    const conf = (b.confidence ?? 0) - (a.confidence ?? 0);
    if (conf !== 0) return conf;
    const sen = seniorityRank(b.seniority) - seniorityRank(a.seniority);
    if (sen !== 0) return sen;
    return (a.last_name ?? "").localeCompare(b.last_name ?? "");
  });

  eligible.forEach((c, i) => {
    c.rank = i + 1;
    c.selection_reason = `Tier ${c.tier} ${c.persona} ${tierRoleWord(c.tier)}; confidence ${
      c.confidence ?? "n/a"
    }; verification ${c.verification_status ?? "n/a"}`;
  });

  const selected = eligible[0] ?? null;
  const flags: string[] = [];
  if (selected) {
    selected.is_selected = true;
    const verif = (selected.verification_status ?? "").toLowerCase();
    if (
      (selected.confidence != null && selected.confidence < icp.poc.low_confidence) ||
      verif === "accept_all" ||
      verif === "unknown"
    )
      flags.push("POC_LOW_CONFIDENCE");
  } else {
    flags.push("NO_POC");
  }

  return { contacts, selected, s_engled, flags };
}
