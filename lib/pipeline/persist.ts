import { serviceClient } from "@/lib/db/service";
import type { CompanyRunResult } from "@/lib/pipeline/engineRun";

type SB = ReturnType<typeof serviceClient>;

function stageFor(result: CompanyRunResult): string {
  const v = result.verdict;
  if (v === "GO") return result.draft ? "awaiting_review" : "hold";
  if (v === "HOLD") return "hold";
  if (v === "NO_GO") return "no_go";
  return "error";
}

/** Persist a full company run into all the trace tables. Idempotent: clears prior rows first. */
export async function persistCompanyResult(
  db: SB,
  companyId: string,
  runId: string,
  result: CompanyRunResult,
  costUsd = 0,
): Promise<void> {
  // Clear prior derived rows (idempotent re-run).
  for (const t of ["pages", "evidence", "qualifications", "research_steps", "pain_points"] as const) {
    await db.from(t).delete().eq("company_id", companyId);
  }
  await db.from("drafts").delete().eq("company_id", companyId);
  await db.from("contacts").delete().eq("company_id", companyId);
  await db.from("company_facts").delete().eq("company_id", companyId);

  // Pages
  if (result.pages.length) {
    await db.from("pages").insert(
      result.pages.map((p) => ({
        company_id: companyId,
        url: p.url,
        kind: p.kind,
        fetched_via: p.fetched_via,
        http_status: p.http_status,
        content_md: p.content_md.slice(0, 200_000),
        content_hash: p.content_hash,
        iteration: p.iteration ?? 0,
      })) as never,
    );
  }

  // Evidence (keep synthetic -> uuid map by insertion order)
  const evMap = new Map<string, string>();
  if (result.evidence.length) {
    const { data: inserted } = await db
      .from("evidence")
      .insert(
        result.evidence.map((e) => ({
          company_id: companyId,
          criterion: e.criterion,
          signal: e.signal,
          value: e.value as never,
          quote: e.quote,
          source_url: e.source_url,
          source_kind: e.source_kind,
          iteration: e.iteration,
        })) as never,
      )
      .select("id");
    (inserted ?? []).forEach((row: { id: string }, i: number) => {
      const synthetic = result.evidence[i]?.id;
      if (synthetic) evMap.set(synthetic, row.id);
    });
  }

  // company_facts
  await db.from("company_facts").insert({
    company_id: companyId,
    facts: { domain: result.domain } as never,
    signals: result.signals as never,
    model: "mock",
    prompt_version: "extract",
  } as never);

  // qualifications: one row per trace entry; the final one carries criterion_points.
  const q = result.qualification;
  await db.from("qualifications").insert(
    q.trace.map((t, i) => ({
      company_id: companyId,
      iteration: t.iteration,
      score: t.score,
      confidence: t.confidence,
      decision: t.decision,
      criterion_points: (i === q.trace.length - 1 ? q.criterion_points : null) as never,
      gates: i === q.trace.length - 1 ? q.gates : [],
      flags: i === q.trace.length - 1 ? result.flags : [],
      trace: (i === q.trace.length - 1 ? q.trace : null) as never,
    })) as never,
  );

  // research_steps
  if (result.research_steps.length) {
    await db.from("research_steps").insert(
      result.research_steps.map((r) => ({
        company_id: companyId,
        iteration: r.iteration,
        tool: r.tool,
        args: r.args as never,
        result_summary: r.result_summary,
      })) as never,
    );
  }

  // contacts
  let selectedContactId: string | null = null;
  if (result.contacts.length) {
    const { data: insertedContacts } = await db
      .from("contacts")
      .insert(
        result.contacts.map((c) => ({
          company_id: companyId,
          first_name: c.first_name,
          last_name: c.last_name,
          email: c.email,
          position: c.position,
          seniority: c.seniority,
          department: c.department,
          persona: c.persona,
          tier: c.tier,
          hunter_confidence: c.confidence,
          verification_status: c.verification_status,
          eligible: c.eligible,
          rank: c.rank,
          selection_reason: c.selection_reason ?? c.ineligible_reason,
          source: c.source,
          is_selected: c.is_selected,
        })) as never,
      )
      .select("id, email, is_selected");
    const sel = (insertedContacts ?? []).find((c: { is_selected: boolean }) => c.is_selected);
    selectedContactId = (sel as { id: string } | undefined)?.id ?? null;
  }

  // pain_points (top 2)
  if (result.pains.top.length) {
    await db.from("pain_points").insert(
      result.pains.top.map((p) => ({
        company_id: companyId,
        contact_id: selectedContactId,
        code: p.code,
        rank: p.rank,
        score: p.score,
        rationale: `${p.text} — top pain for the selected persona.`,
        evidence_ids: [] as never,
      })) as never,
    );
  }

  // draft
  if (result.draft) {
    const hookUuid = evMap.get(result.draft.hook_evidence_id) ?? null;
    await db.from("drafts").insert({
      company_id: companyId,
      contact_id: selectedContactId,
      version: 1,
      subject: result.draft.subject,
      body: result.draft.body,
      hook_evidence_id: hookUuid,
      claim_ids: result.draft.claim_ids,
      pain_code: result.draft.pain_code,
      validator: result.draft.validator as never,
      critic: result.draft.critic as never,
      status: result.draft.validator.ok ? "ready" : "blocked",
      prompt_version: "write",
    } as never);
  }

  // companies summary
  await db
    .from("companies")
    .update({
      name: result.company_name,
      stage: stageFor(result),
      verdict: result.verdict,
      score: q.gates.length ? null : q.score,
      confidence: q.gates.length ? null : q.confidence,
      loops_used: q.loops_used,
      gates: q.gates,
      flags: result.flags,
      hold_reason: result.hold_reason,
      cost_usd: costUsd,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", companyId);
}
