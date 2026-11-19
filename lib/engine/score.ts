import type {
  CriterionKey,
  CriterionStatus,
  EvalResult,
  IcpParams,
  ScoreResult,
  Signals,
} from "@/lib/engine/types";

export function employeesEst(s: Signals): number | null {
  const { employees_min: lo, employees_max: hi } = s;
  if (lo != null && hi != null) return Math.round((lo + hi) / 2);
  if (lo != null) return lo;
  if (hi != null) return hi;
  return null;
}

/** Signal groups per criterion for the found/unknown status. */
const CRITERION_SIGNALS: Record<CriterionKey, (keyof Signals)[]> = {
  C1: ["is_saas"],
  C2: ["funding_stage", "funding_date"],
  C3: ["hiring_compliance_role", "security_in_progress", "enterprise_pressure"],
  C4: ["employees_min", "employees_max"],
  C5: ["enterprise_customers", "customer_count"],
  C6: ["industry"],
  C7: ["cloud_providers"],
};

function statusFor(key: CriterionKey, s: Signals): CriterionStatus {
  const allNull = CRITERION_SIGNALS[key].every((k) => s[k] == null);
  return allNull ? "unknown" : "found";
}

export function monthsBetween(from: string, to: Date): number {
  const d = new Date(from);
  if (Number.isNaN(d.getTime())) return 0;
  return (
    (to.getFullYear() - d.getFullYear()) * 12 +
    (to.getMonth() - d.getMonth()) +
    (to.getDate() >= d.getDate() ? 0 : -1)
  );
}

export interface ScoreOptions {
  now?: Date;
  /** extra flags detected at extraction time (e.g. CONFLICTING_EVIDENCE). */
  extraFlags?: string[];
}

export function scoreCompany(
  s: Signals,
  icp: IcpParams,
  opts: ScoreOptions = {},
): ScoreResult {
  const now = opts.now ?? new Date();
  const est = employeesEst(s);

  // --- Hard gates ---
  const gates: string[] = [];
  if (s.is_saas === false) gates.push("NOT_SAAS");
  if (
    (s.funding_stage != null && icp.gates.late_stages.includes(s.funding_stage)) ||
    (est != null && est > icp.gates.employees_too_large)
  )
    gates.push("TOO_LATE_STAGE");
  if (est != null && est < icp.gates.employees_too_small) gates.push("TOO_SMALL");
  if (s.competitor_vendor === icp.gates.sprinto_vendor) gates.push("ALREADY_SPRINTO");

  // --- Points ---
  const p = icp.points;
  const cp: Record<CriterionKey, number> = {
    C1: 0,
    C2: 0,
    C3: 0,
    C4: 0,
    C5: 0,
    C6: 0,
    C7: 0,
  };

  if (s.is_saas === true) cp.C1 = p.c1_saas;

  if (s.funding_stage != null && p.c2_funding[s.funding_stage] != null)
    cp.C2 = p.c2_funding[s.funding_stage]!;

  let c3 = 0;
  if (s.hiring_compliance_role === true) c3 += p.c3_hiring;
  if (s.security_in_progress === true) c3 += p.c3_security_in_progress;
  if (s.enterprise_pressure === true) c3 += p.c3_enterprise_pressure;
  cp.C3 = Math.min(c3, p.c3_cap);

  let borderlineSize = false;
  if (est != null) {
    const [coreLo, coreHi] = p.c4_core_band;
    if (est >= coreLo && est <= coreHi) {
      cp.C4 = p.c4_core_points;
    } else if (p.c4_side_bands.some(([lo, hi]) => est >= lo && est <= hi)) {
      cp.C4 = p.c4_side_points;
      borderlineSize = true;
    }
  }

  let c5 = 0;
  if (s.enterprise_customers === true) c5 += p.c5_enterprise_customers;
  if (s.customer_count != null && s.customer_count >= p.c5_customer_count_min)
    c5 += p.c5_customer_count_points;
  cp.C5 = c5;

  if (s.industry != null) {
    if (icp.regulated_industries.includes(s.industry)) cp.C6 = p.c6_regulated_points;
    else if (s.industry !== "b2c") cp.C6 = p.c6_other_b2b_points;
  }

  if (s.cloud_providers != null && s.cloud_providers.length > 0) cp.C7 = p.c7_cloud;

  const score = (Object.values(cp) as number[]).reduce((a, b) => a + b, 0);

  // --- Confidence ---
  const status = {} as Record<CriterionKey, CriterionStatus>;
  let found = 0;
  (Object.keys(CRITERION_SIGNALS) as CriterionKey[]).forEach((k) => {
    status[k] = statusFor(k, s);
    if (status[k] === "found") found += 1;
  });
  const raw = found / 7;
  const f = Math.pow(10, icp.confidence_rounding);
  const confidence = Math.round(raw * f) / f;

  // --- Scoring-time flags ---
  const flags = new Set<string>(opts.extraFlags ?? []);
  if (s.already_certified === true) flags.add("ALREADY_CERTIFIED");
  if (s.competitor_vendor != null && s.competitor_vendor !== icp.gates.sprinto_vendor)
    flags.add("COMPETITOR_CUSTOMER");
  if (borderlineSize) flags.add("BORDERLINE_SIZE");
  if (
    s.funding_date != null &&
    monthsBetween(s.funding_date, now) > icp.flags.stale_funding_months
  )
    flags.add("STALE_FUNDING");

  return {
    gates,
    criterion_points: cp,
    criterion_status: status,
    score,
    confidence,
    flags: [...flags],
  };
}

export interface EvalContext {
  now?: Date;
  loopsRemaining: number;
  extraFlags?: string[];
}

/** One scoring pass → a decision given how many research loops remain. */
export function evaluate(s: Signals, icp: IcpParams, ctx: EvalContext): EvalResult {
  const base = scoreCompany(s, icp, { now: ctx.now, extraFlags: ctx.extraFlags });
  const { score, confidence, gates } = base;
  const v = icp.verdict;
  const flags = new Set(base.flags);

  if (gates.length > 0) {
    return { ...base, flags: [...flags], decision: "NO_GO", reason: gates[0] };
  }

  const confident = confidence >= v.min_confidence;
  const canResearch = ctx.loopsRemaining > 0;

  let decision: EvalResult["decision"];
  let reason: string | null = null;

  if (confident) {
    if (score >= v.go_threshold) {
      decision = "GO";
    } else if (score < v.nogo_threshold) {
      decision = "NO_GO";
      reason = "LOW_FIT";
    } else {
      decision = canResearch ? "RESEARCH_MORE" : "HOLD";
    }
  } else {
    if (canResearch) {
      decision = "RESEARCH_MORE";
    } else if (score >= v.go_threshold) {
      decision = "GO";
      flags.add("LOW_CONFIDENCE");
      reason = "LOW_CONFIDENCE";
    } else if (score >= v.nogo_threshold) {
      decision = "HOLD";
    } else {
      decision = "NO_GO";
      reason = "LOW_FIT";
    }
  }

  // GO-with-low-confidence flag even when confident path never hits (safety) handled above.
  if (decision === "GO" && confidence < v.min_confidence) flags.add("LOW_CONFIDENCE");

  // BORDERLINE_SCORE only applies to GO verdicts within the window.
  if (
    decision === "GO" &&
    score >= v.go_threshold &&
    score < v.go_threshold + v.borderline_score_window
  )
    flags.add("BORDERLINE_SCORE");

  return { ...base, flags: [...flags], decision, reason };
}
