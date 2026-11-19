import type { IcpParams, Signals } from "@/lib/engine/types";
import type { Persona } from "@/lib/engine/poc";

export interface PainDef {
  code: string;
  text: string;
  weights: { security: number; engineering: number; founder: number };
  condition: (d: PainSignals) => boolean;
}

export interface PainSignals {
  S_ENT: boolean;
  S_FIRST: boolean;
  S_ENGLED: boolean;
  S_EXPAND: boolean;
  S_CERT: boolean;
  S_COMP: boolean;
  S_AI: boolean;
}

export interface RankedPain {
  code: string;
  text: string;
  rank: number;
  score: number;
  weight: number;
}

export const PAIN_LIBRARY: PainDef[] = [
  {
    code: "PP1",
    text: "Enterprise deals stall on security reviews and SOC 2/ISO proof requests",
    weights: { security: 2, engineering: 2, founder: 3 },
    condition: (d) => d.S_ENT && !d.S_CERT,
  },
  {
    code: "PP2",
    text: "Engineers pulled off the roadmap to collect audit evidence",
    weights: { security: 1, engineering: 3, founder: 2 },
    condition: (d) => d.S_ENGLED,
  },
  {
    code: "PP3",
    text: "First audit with no in-house playbook or GRC team",
    weights: { security: 3, engineering: 2, founder: 2 },
    condition: (d) => d.S_FIRST,
  },
  {
    code: "PP4",
    text: "Adding frameworks for new markets/regulators (ISO 27001 for EU/UK, HIPAA, GDPR, DPDP)",
    weights: { security: 2, engineering: 1, founder: 2 },
    condition: (d) => d.S_EXPAND,
  },
  {
    code: "PP5",
    text: "Staying audit-ready between audits (control drift)",
    weights: { security: 3, engineering: 2, founder: 1 },
    condition: (d) => d.S_CERT,
  },
  {
    code: "PP6",
    text: "Current compliance tool flags issues but leaves the work to the team",
    weights: { security: 2, engineering: 1, founder: 2 },
    condition: (d) => d.S_COMP,
  },
  {
    code: "PP7",
    text: "Volume of customer security questionnaires",
    weights: { security: 3, engineering: 1, founder: 1 },
    condition: (d) => d.S_CERT,
  },
  {
    code: "PP8",
    text: "AI governance (ISO 42001) for an AI product",
    weights: { security: 2, engineering: 2, founder: 2 },
    condition: (d) => d.S_AI,
  },
];

export function derivePainSignals(
  s: Signals,
  opts: { sprintoVendor?: string } = {},
  regulated: string[],
  s_engled: boolean,
): PainSignals {
  const sprinto = opts.sprintoVendor ?? "sprinto";
  return {
    S_ENT: Boolean(s.enterprise_pressure) || Boolean(s.enterprise_customers),
    S_FIRST:
      Boolean(s.security_in_progress) ||
      (Boolean(s.hiring_compliance_role) && !s.already_certified),
    S_ENGLED: s_engled,
    S_EXPAND:
      (s.expansion_regions?.length ?? 0) > 0 ||
      (s.industry != null && regulated.includes(s.industry)),
    S_CERT: Boolean(s.already_certified),
    S_COMP: s.competitor_vendor != null && s.competitor_vendor !== sprinto,
    S_AI: Boolean(s.ai_product),
  };
}

export function rankPains(
  d: PainSignals,
  persona: Persona,
  icp: IcpParams,
): { all: RankedPain[]; top: RankedPain[] } {
  const p: Exclude<Persona, null> = persona ?? "founder";
  const candidates = PAIN_LIBRARY.filter((def) => def.condition(d)).map((def, _i) => {
    const weight = def.weights[p];
    return {
      code: def.code,
      text: def.text,
      weight,
      score: weight + icp.pains.base,
      libIndex: PAIN_LIBRARY.findIndex((x) => x.code === def.code),
    };
  });

  candidates.sort((a, b) => b.score - a.score || a.libIndex - b.libIndex);

  const all: RankedPain[] = candidates.map((c, i) => ({
    code: c.code,
    text: c.text,
    rank: i + 1,
    score: c.score,
    weight: c.weight,
  }));

  return { all, top: all.slice(0, 2).map((x, i) => ({ ...x, rank: i + 1 })) };
}
