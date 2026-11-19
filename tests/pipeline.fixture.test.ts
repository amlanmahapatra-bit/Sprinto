import { describe, it, expect } from "vitest";
import { runCompany } from "@/lib/pipeline/engineRun";
import { mockAdapters } from "@/lib/adapters/mock";
import { ICP_V1 } from "@/lib/icp/defaults";
import { FIXTURE_DOMAINS } from "@/lib/fixtures/data";

const NOW = new Date("2026-11-04T00:00:00Z");

describe("end-to-end fixture pipeline (mock adapters)", () => {
  it("produces the expected run summary", async () => {
    const byDomain: Record<string, Awaited<ReturnType<typeof runCompany>>> = {};
    for (const d of FIXTURE_DOMAINS) {
      byDomain[d] = await runCompany(d, mockAdapters, ICP_V1, { now: NOW });
    }

    const led = byDomain["ledgerly.example"];
    expect(led.verdict).toBe("GO");
    expect(led.qualification.score).toBe(95);
    expect(led.poc?.first_name).toBe("Neha");
    expect(led.pains.top.map((p) => p.code)).toEqual(["PP3", "PP1"]);
    expect(led.draft?.validator.ok).toBe(true);
    expect(led.draft?.hook_evidence_id).toBeTruthy();
    // hook must trace to a real evidence item of this company
    expect(led.evidence.map((e) => e.id)).toContain(led.draft?.hook_evidence_id);

    const tv = byDomain["trustvault.example"];
    expect(tv.verdict).toBe("GO");
    expect(tv.qualification.score).toBe(78);
    expect(tv.poc?.first_name).toBe("Meera");
    expect(tv.flags).toEqual(expect.arrayContaining(["ALREADY_CERTIFIED", "COMPETITOR_CUSTOMER"]));
    expect(tv.pains.top.map((p) => p.code)).toEqual(["PP5", "PP4"]);
    expect(tv.draft?.validator.ok).toBe(true);

    const orbit = byDomain["orbitfleet.example"];
    expect(orbit.verdict).toBe("HOLD");
    expect(orbit.qualification.score).toBe(53);
    expect(orbit.qualification.loops_used).toBe(3);
    expect(orbit.poc).toBeNull();

    expect(byDomain["pixelpantry.example"].verdict).toBe("NO_GO");
    expect(byDomain["pixelpantry.example"].qualification.gates).toContain("NOT_SAAS");
    expect(byDomain["megacorp.example"].verdict).toBe("NO_GO");
    expect(byDomain["megacorp.example"].qualification.gates).toContain("TOO_LATE_STAGE");
  });
});
