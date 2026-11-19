import type { Signals, ResearchDelta } from "@/lib/engine/types";
import type { RankableContact } from "@/lib/engine/poc";

export interface ScrapedPage {
  url: string;
  kind: string;
  content_md: string;
  http_status: number;
  fetched_via: string;
  content_hash: string;
  iteration?: number;
}

export interface EvidenceItem {
  id: string;
  criterion: string | null;
  signal: string | null;
  value: unknown;
  quote: string | null;
  source_url: string | null;
  source_kind: string;
  iteration: number;
}

export interface ExtractResult {
  company_name: string;
  signals: Signals;
  evidence: EvidenceItem[];
  facts: Record<string, unknown>;
  model: string;
  prompt_version: string;
}

export interface WriterInput {
  company_name: string;
  domain: string;
  poc_first_name: string;
  poc_title: string;
  pain_primary: { code: string; text: string };
  pain_secondary: { code: string; text: string } | null;
  hook: { evidence_id: string; text: string; source_url: string | null };
  claim: { id: string; text: string };
  sender_name: string;
  sender_title: string;
  cta_minutes: number;
}

export interface WriterOutput {
  subject: string;
  body: string;
  hook_evidence_id: string;
  claim_ids: string[];
  pain_code: string;
}

export interface CriticOutput {
  specificity: number;
  relevance: number;
  clarity: number;
  would_reply: number;
  overall: number;
  critique: string;
}

export interface OutboundEmail {
  to: string;
  from: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  intendedRecipient: string;
}

export interface Adapters {
  scrape(domain: string, iteration?: number): Promise<ScrapedPage[]>;
  extract(domain: string, pages: ScrapedPage[], iteration: number): Promise<ExtractResult>;
  research(domain: string, iteration: number, signals: Signals): Promise<ResearchDelta | null>;
  hunterSearch(domain: string): Promise<RankableContact[]>;
  write(input: WriterInput): Promise<WriterOutput>;
  critique(subject: string, body: string, title: string): Promise<CriticOutput>;
  sendEmail(msg: OutboundEmail): Promise<{ messageId: string; threadId: string }>;
  kind: "mock" | "real";
}
