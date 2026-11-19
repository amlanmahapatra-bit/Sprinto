import qualificationCases from "@/tests/fixtures/qualification_cases.json";
import ledgerlyHunter from "@/tests/fixtures/hunter/ledgerly.example.json";
import trustvaultHunter from "@/tests/fixtures/hunter/trustvault.example.json";
import type { Signals, ResearchDelta } from "@/lib/engine/types";
import type { RankableContact } from "@/lib/engine/poc";

interface CaseInput {
  company_name: string;
  initial_signals: Signals;
  research_deltas: ResearchDelta[];
}

const CASES = (qualificationCases as { cases: Record<string, CaseInput> }).cases;

export const FIXTURE_DOMAINS = Object.keys(CASES);

export function fixtureCase(domain: string): CaseInput | undefined {
  return CASES[domain];
}

const HUNTER: Record<string, unknown> = {
  "ledgerly.example": ledgerlyHunter,
  "trustvault.example": trustvaultHunter,
};

export function fixtureHunter(domain: string): RankableContact[] {
  const data = (HUNTER[domain] as { data?: { emails?: any[] } } | undefined)?.data;
  if (!data?.emails) return [];
  return data.emails.map((e) => ({
    email: e.value,
    first_name: e.first_name ?? null,
    last_name: e.last_name ?? null,
    position: e.position ?? null,
    seniority: e.seniority ?? null,
    department: e.department ?? null,
    type: e.type ?? "personal",
    confidence: e.confidence ?? null,
    verification_status: e.verification?.status ?? null,
    source: "hunter" as const,
  }));
}
