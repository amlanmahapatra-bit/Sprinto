import { describe, it, expect } from "vitest";
import { validateDraft, type ValidatorContext } from "@/lib/engine/validator";
import { allAllowedClaimNumbers } from "@/lib/llm/sprintoClaims";
import { ICP_V1 } from "@/lib/icp/defaults";

const EVIDENCE_TEXT = `Security & Compliance Engineer: own our SOC 2 Type II and ISO 27001 programmes.
We are currently working toward SOC 2 Type II and expect our audit report in Q1 2027.
Ledgerly runs on AWS in the US and India regions.`;

const ctx: ValidatorContext = {
  company_name: "Ledgerly",
  poc_first_name: "Neha",
  poc_last_name: "Iyer",
  evidence_ids: ["ev-careers-1"],
  evidence_numbers: [2027],
  evidence_text: EVIDENCE_TEXT,
  allowed_claim_numbers: allAllowedClaimNumbers(),
};

const goodBody = `Hi Neha, saw Ledgerly is hiring a Security & Compliance Engineer to own SOC 2 Type II and ISO 27001, right after the Series B. That's usually the moment questionnaires from US enterprise buyers start piling up on one person's desk.

Teams like yours use Sprinto to get SOC 2 and ISO 27001 audit-ready in as little as 3 weeks, with evidence collected automatically from AWS instead of by hand.

Would it help to see how that maps to the Q1 audit you have planned? Happy to walk through it in 15 minutes.

Neha, not relevant? Reply 'no' and I won't follow up.`;

const goodDraft = {
  subject: "SOC 2 before the US push?",
  body: goodBody,
  hook_evidence_id: "ev-careers-1",
  claim_ids: ["SC4"],
  pain_code: "PP3",
};

describe("validator", () => {
  it("passes a well-formed email", () => {
    const r = validateDraft(goodDraft, ctx, ICP_V1);
    expect(r.ok, JSON.stringify(r.failures)).toBe(true);
  });

  it("rejects a number not in evidence (V4)", () => {
    const r = validateDraft(
      { ...goodDraft, body: goodBody.replace("3 weeks", "7 weeks") },
      ctx,
      ICP_V1,
    );
    expect(r.checks.V4.ok).toBe(false);
    expect(r.ok).toBe(false);
  });

  it("rejects a wrong first name (V1)", () => {
    const r = validateDraft(
      { ...goodDraft, body: goodBody.replace(/Neha/g, "Nisha") },
      ctx,
      ICP_V1,
    );
    expect(r.checks.V1.ok).toBe(false);
  });

  it("rejects an invented customer name (V5)", () => {
    const r = validateDraft(
      {
        ...goodDraft,
        body: goodBody.replace(
          "questionnaires from US enterprise buyers",
          "questionnaires from Stripe and Google",
        ),
      },
      ctx,
      ICP_V1,
    );
    expect(r.checks.V5.ok).toBe(false);
    expect(r.checks.V5.detail).toMatch(/Stripe|Google/);
  });

  it("rejects a banned phrase (V7)", () => {
    const r = validateDraft(
      { ...goodDraft, body: `Hi Neha, I hope this email finds you well. ${goodBody}` },
      ctx,
      ICP_V1,
    );
    expect(r.checks.V7.ok).toBe(false);
  });

  it("rejects missing opt-out (V9)", () => {
    const r = validateDraft(
      { ...goodDraft, body: goodBody.replace("Neha, not relevant? Reply 'no' and I won't follow up.", "") },
      ctx,
      ICP_V1,
    );
    expect(r.checks.V9.ok).toBe(false);
  });

  it("rejects a bad hook evidence id (V3)", () => {
    const r = validateDraft({ ...goodDraft, hook_evidence_id: "nope" }, ctx, ICP_V1);
    expect(r.checks.V3.ok).toBe(false);
  });
});
