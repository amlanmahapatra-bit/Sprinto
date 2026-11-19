// Core domain types for the deterministic engine. No I/O here.

export type FundingStage =
  | "pre_seed"
  | "seed"
  | "series_a"
  | "series_b"
  | "series_c"
  | "series_d_plus"
  | "public"
  | "acquired"
  | "bootstrapped";

export type Industry =
  | "fintech"
  | "healthtech"
  | "hrtech"
  | "insurtech"
  | "legaltech"
  | "edtech"
  | "data_ai_infra"
  | "devtools"
  | "security"
  | "martech"
  | "logistics"
  | "ecommerce_enablement"
  | "other_b2b"
  | "b2c";

export type Cert =
  | "soc2_type1"
  | "soc2_type2"
  | "iso27001"
  | "iso27701"
  | "iso42001"
  | "gdpr"
  | "hipaa"
  | "pci_dss"
  | "dpdp";

export type Vendor =
  | "vanta"
  | "drata"
  | "secureframe"
  | "scrut"
  | "thoropass"
  | "delve"
  | "sprinto"
  | "safebase"
  | "other";

export type CloudProvider = "aws" | "gcp" | "azure";

/** Flat signals object — the scorer's input. `null` = not known yet; `false` = looked, not there. */
export interface Signals {
  is_saas: boolean | null;
  funding_stage: FundingStage | null;
  funding_date: string | null; // ISO date
  employees_min: number | null;
  employees_max: number | null;
  hiring_compliance_role: boolean | null;
  security_in_progress: boolean | null;
  enterprise_pressure: boolean | null;
  already_certified: boolean | null;
  competitor_vendor: Vendor | null;
  enterprise_customers: boolean | null;
  customer_count: number | null;
  industry: Industry | null;
  cloud_providers: CloudProvider[] | null;
  ai_product: boolean | null;
  expansion_regions: string[] | null;
}

export type Verdict = "GO" | "NO_GO" | "HOLD" | "RESEARCH_MORE";

export type CriterionKey = "C1" | "C2" | "C3" | "C4" | "C5" | "C6" | "C7";
export type CriterionStatus = "found" | "unknown";

export interface ScoreResult {
  gates: string[];
  criterion_points: Record<CriterionKey, number>;
  criterion_status: Record<CriterionKey, CriterionStatus>;
  score: number;
  confidence: number;
  flags: string[];
}

export interface EvalResult extends ScoreResult {
  decision: Verdict;
  reason: string | null;
}

export interface TraceEntry {
  iteration: number;
  score: number;
  confidence: number;
  decision: Verdict;
  reason?: string;
}

export interface QualificationResult {
  verdict: Verdict;
  score: number;
  confidence: number;
  loops_used: number;
  gates: string[];
  flags: string[];
  criterion_points: Record<CriterionKey, number>;
  criterion_status: Record<CriterionKey, CriterionStatus>;
  trace: TraceEntry[];
  signals: Signals;
  reason: string | null;
}

/** Scripted research delta (what the mock/real research agent yields per loop). */
export interface ResearchDelta {
  iteration: number;
  tool: string;
  args: Record<string, unknown>;
  signals: Partial<Signals>;
}

export type ResearchAgent = (
  iteration: number,
  signals: Signals,
) => ResearchDelta | null | Promise<ResearchDelta | null>;

// ---- ICP config params ----

export interface IcpParams {
  gates: {
    employees_too_small: number; // < this → TOO_SMALL
    employees_too_large: number; // > this → TOO_LATE_STAGE
    late_stages: FundingStage[];
    sprinto_vendor: Vendor;
  };
  points: {
    c1_saas: number;
    c2_funding: Partial<Record<FundingStage, number>>;
    c3_hiring: number;
    c3_security_in_progress: number;
    c3_enterprise_pressure: number;
    c3_cap: number;
    c4_core_band: [number, number];
    c4_core_points: number;
    c4_side_bands: Array<[number, number]>;
    c4_side_points: number;
    c5_enterprise_customers: number;
    c5_customer_count_min: number;
    c5_customer_count_points: number;
    c6_regulated_points: number;
    c6_other_b2b_points: number;
    c7_cloud: number;
  };
  regulated_industries: Industry[];
  verdict: {
    go_threshold: number;
    nogo_threshold: number;
    min_confidence: number;
    max_research_loops: number;
    stop_if_no_new_evidence: boolean;
    borderline_score_window: number; // GO & < go+window → BORDERLINE_SCORE
  };
  flags: {
    stale_funding_months: number;
  };
  poc: {
    min_confidence: number; // eligibility
    low_confidence: number; // POC_LOW_CONFIDENCE threshold
    founder_exception_headcount: number; // < this and no tier1 → founder above eng
  };
  pains: {
    base: number; // pain_score = persona_weight + base
  };
  email: {
    subject_max_words: number;
    body_min_words: number;
    body_max_words: number;
    cta_minutes: number;
    critic_min_score: number;
  };
  send: {
    max_sends_per_day: number;
  };
  pricing: {
    // USD per 1M tokens, per model id used in cost accounting
    input_per_mtok: number;
    output_per_mtok: number;
  };
  confidence_rounding: number;
}
