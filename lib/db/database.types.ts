// Concise, faithful typing of the Supabase schema (mirrors generate_typescript_types output).
// Insert/Update are modelled as Partial<Row> which is safe and compiles against supabase-js.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type T<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] };

export interface ApiUsageRow { provider: string; period: string; count: number }
export interface CompanyRow {
  id: string; run_id: string; domain: string; name: string | null; stage: string;
  verdict: string | null; score: number | null; confidence: number | null; loops_used: number;
  gates: string[]; flags: string[]; hold_reason: string | null; error: string | null;
  cost_usd: number; started_at: string | null; updated_at: string;
}
export interface CompanyFactsRow {
  company_id: string; facts: Json | null; signals: Json | null; model: string | null;
  prompt_version: string | null; updated_at: string;
}
export interface ContactRow {
  id: string; company_id: string; first_name: string | null; last_name: string | null;
  email: string | null; position: string | null; seniority: string | null; department: string | null;
  persona: string | null; tier: number | null; hunter_confidence: number | null;
  verification_status: string | null; eligible: boolean; rank: number | null;
  selection_reason: string | null; source: string; is_selected: boolean; created_at: string;
}
export interface DraftRow {
  id: string; company_id: string; contact_id: string | null; version: number;
  subject: string | null; body: string | null; hook_evidence_id: string | null; claim_ids: string[];
  pain_code: string | null; validator: Json | null; critic: Json | null; status: string;
  prompt_version: string | null; created_at: string;
}
export interface EmailEventRow {
  id: string; send_id: string; type: string; user_agent: string | null; ip_hash: string | null; created_at: string;
}
export interface EvidenceRow {
  id: string; company_id: string; criterion: string | null; signal: string | null; value: Json | null;
  quote: string | null; source_url: string | null; source_kind: string | null; iteration: number; created_at: string;
}
export interface IcpConfigRow {
  version: number; params: Json; sprinto_context_version: string; note: string | null;
  created_by: string | null; is_active: boolean; created_at: string;
}
export interface LlmCallRow {
  id: string; company_id: string | null; step: string | null; model: string | null;
  prompt_version: string | null; tokens_in: number; tokens_out: number; latency_ms: number | null;
  cost_usd: number; ok: boolean; error: string | null; created_at: string;
}
export interface PageRow {
  id: string; company_id: string; url: string; kind: string | null; fetched_via: string | null;
  http_status: number | null; content_md: string | null; content_hash: string | null;
  storage_path: string | null; iteration: number; fetched_at: string;
}
export interface PainPointRow {
  id: string; company_id: string; contact_id: string | null; code: string; rank: number | null;
  score: number | null; rationale: string | null; evidence_ids: string[]; created_at: string;
}
export interface ProfileRow { user_id: string; role: string; created_at: string }
export interface QualificationRow {
  id: string; company_id: string; iteration: number; score: number | null; confidence: number | null;
  criterion_points: Json | null; gates: string[]; flags: string[]; decision: string | null;
  trace: Json | null; created_at: string;
}
export interface ResearchStepRow {
  id: string; company_id: string; iteration: number; tool: string; args: Json | null;
  result_summary: string | null; new_evidence_ids: string[]; tokens_in: number; tokens_out: number;
  cost_usd: number; created_at: string;
}
export interface ReviewRow {
  id: string; draft_id: string; action: string; final_subject: string | null; final_body: string | null;
  edit_ratio: number | null; reason_category: string | null; reason_text: string | null;
  reviewer: string | null; created_at: string;
}
export interface RunRow {
  id: string; icp_version: number; mode: string; source: string; created_by: string | null;
  started_at: string; finished_at: string | null; stats: Json;
}
export interface SendRow {
  id: string; run_id: string; company_id: string; draft_id: string | null; to_address: string;
  intended_address: string | null; gmail_message_id: string | null; gmail_thread_id: string | null;
  status: string; error: string | null; sent_at: string | null; replied: boolean;
}

export interface Database {
  public: {
    Tables: {
      api_usage: T<ApiUsageRow>;
      companies: T<CompanyRow>;
      company_facts: T<CompanyFactsRow>;
      contacts: T<ContactRow>;
      drafts: T<DraftRow>;
      email_events: T<EmailEventRow>;
      evidence: T<EvidenceRow>;
      icp_config: T<IcpConfigRow>;
      llm_calls: T<LlmCallRow>;
      pages: T<PageRow>;
      pain_points: T<PainPointRow>;
      profiles: T<ProfileRow>;
      qualifications: T<QualificationRow>;
      research_steps: T<ResearchStepRow>;
      reviews: T<ReviewRow>;
      runs: T<RunRow>;
      sends: T<SendRow>;
    };
    Views: Record<string, never>;
    Functions: { is_gl: { Args: Record<string, never>; Returns: boolean } };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
