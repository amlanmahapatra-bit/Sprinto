import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { runQualification, scriptedAgent } from "@/lib/engine/qualify";
import { employeesEst } from "@/lib/engine/score";
import { selectPoc, type RankableContact } from "@/lib/engine/poc";
import { derivePainSignals, rankPains } from "@/lib/engine/pains";
import { ICP_V1 } from "@/lib/icp/defaults";
import type { Signals } from "@/lib/engine/types";

const ROOT = path.resolve(__dirname, "..");
const cases = JSON.parse(
  fs.readFileSync(path.join(ROOT, "tests/fixtures/qualification_cases.json"), "utf8"),
).cases as Record<string, any>;
const golden = JSON.parse(
  fs.readFileSync(path.join(ROOT, "tests/golden_expected.json"), "utf8"),
).cases as Record<string, any>;

const NOW = new Date("2026-11-04T00:00:00Z");

function hunter(domain: string): RankableContact[] {
  const p = path.join(ROOT, "tests/fixtures/hunter", `${domain}.json`);
  if (!fs.existsSync(p)) return [];
  const data = JSON.parse(fs.readFileSync(p, "utf8")).data;
  return (data.emails as any[]).map((e) => ({
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

describe("golden qualification", () => {
  for (const [domain, expected] of Object.entries(golden)) {
    it(domain, async () => {
      const input = cases[domain];
      const res = await runQualification(
        input.initial_signals as Signals,
        ICP_V1,
        scriptedAgent(input.research_deltas ?? []),
        { now: NOW },
      );

      expect(res.verdict).toBe(expected.verdict);
      if (expected.score !== undefined) expect(res.score).toBe(expected.score);
      if (expected.confidence !== undefined) expect(res.confidence).toBe(expected.confidence);
      if (expected.loops !== undefined) expect(res.loops_used).toBe(expected.loops);
      if (expected.gates) expect(res.gates.sort()).toEqual([...expected.gates].sort());
      if (expected.flags) expect(res.flags.sort()).toEqual([...expected.flags].sort());
      if (expected.criterion_points)
        expect(res.criterion_points).toEqual(expected.criterion_points);

      if (expected.trace) {
        const got = res.trace.map((t) => ({
          iteration: t.iteration,
          score: t.score,
          confidence: t.confidence,
          decision: t.decision,
        }));
        const want = expected.trace.map((t: any) => ({
          iteration: t.iteration,
          score: t.score,
          confidence: t.confidence,
          decision: t.decision,
        }));
        expect(got).toEqual(want);
      }

      if (res.verdict === "GO") {
        const poc = selectPoc(hunter(domain), ICP_V1, employeesEst(res.signals));
        expect(poc.selected?.email).toBe(expected.poc.email);
        expect(poc.selected?.persona).toBe(expected.poc.persona);
        expect(poc.selected?.tier).toBe(expected.poc.tier);

        if (expected.contact_ranking) {
          const ranking = poc.contacts
            .filter((c) => c.eligible)
            .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
            .map((c) => c.email);
          expect(ranking).toEqual(expected.contact_ranking);
        }
        if (expected.excluded) {
          const excluded = poc.contacts.filter((c) => c.persona === null).map((c) => c.email);
          expect(excluded.sort()).toEqual([...expected.excluded].sort());
        }
        if (expected.ineligible) {
          const inelig = poc.contacts
            .filter((c) => c.tier !== null && !c.eligible)
            .map((c) => ({ email: c.email, reason: c.ineligible_reason }));
          expect(inelig).toEqual(expected.ineligible);
        }

        // Pains
        const ps = derivePainSignals(
          res.signals,
          { sprintoVendor: "sprinto" },
          ICP_V1.regulated_industries,
          poc.s_engled,
        );
        const ranked = rankPains(ps, poc.selected?.persona ?? "founder", ICP_V1);
        expect(ranked.top.map((p) => p.code)).toEqual(expected.pain_points);

        if (expected.pain_scores) {
          const scores = Object.fromEntries(ranked.all.map((p) => [p.code, p.score]));
          expect(scores).toEqual(expected.pain_scores);
        }
      } else {
        expect(expected.poc).toBeNull();
      }
    });
  }
});
