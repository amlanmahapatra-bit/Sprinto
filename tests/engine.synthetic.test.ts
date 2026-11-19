import { describe, it, expect } from "vitest";
import { runQualification, scriptedAgent } from "@/lib/engine/qualify";
import { scoreCompany, evaluate } from "@/lib/engine/score";
import { selectPoc, detectPersona, type RankableContact } from "@/lib/engine/poc";
import { ICP_V1 } from "@/lib/icp/defaults";
import type { Signals } from "@/lib/engine/types";

const NOW = new Date("2026-11-04T00:00:00Z");

function base(overrides: Partial<Signals> = {}): Signals {
  return {
    is_saas: true,
    funding_stage: "series_b",
    funding_date: "2026-06-01",
    employees_min: 100,
    employees_max: 100,
    hiring_compliance_role: false,
    security_in_progress: false,
    enterprise_pressure: false,
    already_certified: false,
    competitor_vendor: null,
    enterprise_customers: false,
    customer_count: null,
    industry: "fintech",
    cloud_providers: ["aws"],
    ai_product: false,
    expansion_regions: [],
    ...overrides,
  };
}

async function qual(s: Signals, deltas: any[] = []) {
  return runQualification(s, ICP_V1, scriptedAgent(deltas), { now: NOW });
}

describe("verdict edge cases", () => {
  it("score exactly 60 with full confidence → GO + BORDERLINE_SCORE", async () => {
    // C1 10 + C2 20 + C4 15 + C6 5 + C7 5 = 55; add C5 enterprise_customers +5? that's 10. Tune to 60.
    // Build: C1 10 + C2 20 (series_b) + C4 15 + C5 10 (ent customers) + C7 5 = 60, C6 industry? needs found.
    const s = base({
      industry: "other_b2b", // +3 → would be 63. Use b2c(0)? b2c not regulated → 0, but b2c found.
      enterprise_customers: true,
    });
    // C1 10 + C2 20 + C4 15 + C5 10 + C6 3 + C7 5 = 63. Drop C7.
    const s2: Signals = { ...s, cloud_providers: [], industry: "other_b2b" };
    // 10+20+15+10+3+0 = 58. Need 60. Add C6 regulated (5) instead of 3 and drop ent customers to count.
    const s3: Signals = base({
      industry: "fintech", // 5
      enterprise_customers: true, // 10
      cloud_providers: [], // 0
    });
    // 10+20+15+10+5+0 = 60
    const r = scoreCompany(s3, ICP_V1, { now: NOW });
    expect(r.score).toBe(60);
    const ev = evaluate(s3, ICP_V1, { now: NOW, loopsRemaining: 0 });
    expect(ev.decision).toBe("GO");
    expect(ev.flags).toContain("BORDERLINE_SCORE");
  });

  it("exactly 40, confidence 1.0, no loops left → HOLD (not NO_GO)", () => {
    // 10 (C1) + 20 (C2) + ... aim for 40 with all criteria found.
    const s = base({
      funding_stage: "series_a", // 20
      hiring_compliance_role: false,
      security_in_progress: false,
      enterprise_pressure: false, // C3 0
      employees_min: 20,
      employees_max: 20, // C4 0 (below side band 30)
      enterprise_customers: false,
      customer_count: 10, // C5 0
      industry: "fintech", // 5
      cloud_providers: ["aws"], // 5
    });
    // 10+20+0+0+0+5+5 = 40
    const r = scoreCompany(s, ICP_V1, { now: NOW });
    expect(r.score).toBe(40);
    expect(r.confidence).toBe(1);
    const ev = evaluate(s, ICP_V1, { now: NOW, loopsRemaining: 0 });
    expect(ev.decision).toBe("HOLD");
  });

  it("headcount 50 and 200 → 15 pts; 49 → 7 + BORDERLINE_SIZE; 14 → TOO_SMALL; 1001 → TOO_LATE_STAGE", () => {
    expect(scoreCompany(base({ employees_min: 50, employees_max: 50 }), ICP_V1, { now: NOW }).criterion_points.C4).toBe(15);
    expect(scoreCompany(base({ employees_min: 200, employees_max: 200 }), ICP_V1, { now: NOW }).criterion_points.C4).toBe(15);
    const r49 = scoreCompany(base({ employees_min: 49, employees_max: 49 }), ICP_V1, { now: NOW });
    expect(r49.criterion_points.C4).toBe(7);
    expect(r49.flags).toContain("BORDERLINE_SIZE");
    expect(scoreCompany(base({ employees_min: 14, employees_max: 14 }), ICP_V1, { now: NOW }).gates).toContain("TOO_SMALL");
    expect(scoreCompany(base({ employees_min: 1001, employees_max: 1001 }), ICP_V1, { now: NOW }).gates).toContain("TOO_LATE_STAGE");
  });

  it("is_saas null never gates", () => {
    const r = scoreCompany(base({ is_saas: null }), ICP_V1, { now: NOW });
    expect(r.gates).not.toContain("NOT_SAAS");
  });

  it("C3 caps at 30", () => {
    const r = scoreCompany(
      base({ hiring_compliance_role: true, security_in_progress: true, enterprise_pressure: true }),
      ICP_V1,
      { now: NOW },
    );
    expect(r.criterion_points.C3).toBe(30);
  });

  it("Sprinto vendor → ALREADY_SPRINTO", () => {
    const r = scoreCompany(base({ competitor_vendor: "sprinto" }), ICP_V1, { now: NOW });
    expect(r.gates).toContain("ALREADY_SPRINTO");
  });

  it("STALE_FUNDING when funding older than 36 months", () => {
    const r = scoreCompany(base({ funding_date: "2022-01-01" }), ICP_V1, { now: NOW });
    expect(r.flags).toContain("STALE_FUNDING");
  });
});

describe("poc ranking edge cases", () => {
  const mk = (over: Partial<RankableContact>): RankableContact => ({
    email: "x@c.example",
    first_name: "X",
    last_name: "Y",
    position: "CTO",
    seniority: "executive",
    department: "it",
    type: "personal",
    confidence: 90,
    verification_status: "valid",
    source: "hunter",
    ...over,
  });

  it("founder outranks CTO when headcount < 80 and no eligible tier 1", () => {
    const contacts = [
      mk({ email: "cto@c.example", position: "CTO", last_name: "Eng" }),
      mk({ email: "founder@c.example", position: "Co-founder & CEO", last_name: "Fou" }),
    ];
    const r = selectPoc(contacts, ICP_V1, 50);
    expect(r.selected?.email).toBe("founder@c.example");
  });

  it("tier-1 contact with invalid verification is skipped", () => {
    const contacts = [
      mk({ email: "ciso@c.example", position: "CISO", verification_status: "invalid", last_name: "Sec" }),
      mk({ email: "cto@c.example", position: "CTO", last_name: "Eng" }),
    ];
    const r = selectPoc(contacts, ICP_V1, 150);
    expect(r.selected?.email).toBe("cto@c.example");
    const ciso = r.contacts.find((c) => c.email === "ciso@c.example");
    expect(ciso?.eligible).toBe(false);
  });

  it("persona detection respects tier priority", () => {
    expect(detectPersona("Head of Security & IT")).toEqual({ persona: "security", tier: 1 });
    expect(detectPersona("Compliance Manager")).toEqual({ persona: "security", tier: 1 });
    expect(detectPersona("VP of Engineering")).toEqual({ persona: "engineering", tier: 2 });
    expect(detectPersona("Co-founder & CEO")).toEqual({ persona: "founder", tier: 3 });
    expect(detectPersona("VP Sales")).toEqual({ persona: null, tier: null });
  });
});
