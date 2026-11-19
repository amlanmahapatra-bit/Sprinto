import type { IcpParams } from "@/lib/engine/types";

/** icp_version = 1 — defaults straight from ICP_SPEC.md. Every threshold/weight lives here, never in code. */
export const ICP_V1: IcpParams = {
  gates: {
    employees_too_small: 15,
    employees_too_large: 1000,
    late_stages: ["series_d_plus", "public", "acquired"],
    sprinto_vendor: "sprinto",
  },
  points: {
    c1_saas: 10,
    c2_funding: { series_a: 20, series_b: 20, series_c: 20, seed: 8 },
    c3_hiring: 12,
    c3_security_in_progress: 10,
    c3_enterprise_pressure: 8,
    c3_cap: 30,
    c4_core_band: [50, 200],
    c4_core_points: 15,
    c4_side_bands: [
      [30, 49],
      [201, 400],
    ],
    c4_side_points: 7,
    c5_enterprise_customers: 10,
    c5_customer_count_min: 50,
    c5_customer_count_points: 5,
    c6_regulated_points: 5,
    c6_other_b2b_points: 3,
    c7_cloud: 5,
  },
  regulated_industries: [
    "fintech",
    "healthtech",
    "hrtech",
    "insurtech",
    "legaltech",
    "data_ai_infra",
    "devtools",
    "security",
  ],
  verdict: {
    go_threshold: 60,
    nogo_threshold: 40,
    min_confidence: 0.7,
    max_research_loops: 3,
    stop_if_no_new_evidence: true,
    borderline_score_window: 5,
  },
  flags: {
    stale_funding_months: 36,
  },
  poc: {
    min_confidence: 70,
    low_confidence: 80,
    founder_exception_headcount: 80,
  },
  pains: {
    base: 2,
  },
  email: {
    subject_max_words: 7,
    body_min_words: 60,
    body_max_words: 120,
    cta_minutes: 15,
    critic_min_score: 4,
  },
  send: {
    max_sends_per_day: 20,
  },
  pricing: {
    // Gemini Flash family placeholder pricing; overridable per icp version.
    input_per_mtok: 0.3,
    output_per_mtok: 2.5,
  },
  confidence_rounding: 2,
};

export const SPRINTO_CONTEXT_VERSION = "2026-11-03";
