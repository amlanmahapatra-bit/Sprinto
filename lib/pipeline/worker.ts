import { serviceClient } from "@/lib/db/service";
import { getAdapters } from "@/lib/adapters";
import { mockAdapters } from "@/lib/adapters/mock";
import { loadActiveIcp } from "@/lib/icp/load";
import { runCompany } from "@/lib/pipeline/engineRun";
import { persistCompanyResult } from "@/lib/pipeline/persist";
import pLimit from "p-limit";

export interface TickResult {
  runId: string;
  claimed: number;
  processed: number;
  errors: { domain: string; error: string }[];
}

// One tick drains the whole run: it claims and processes companies in batches of
// `limit` (each batch FOR UPDATE SKIP LOCKED) until none are left queued or a wall-clock
// budget is hit — so a single call (a UI poll or one cron hit) finishes the run instead
// of depending on the caller to tick again. Resumable: a crash leaves each company at its
// last stage and a later tick re-claims it. The budget stays under the route's maxDuration.
const TICK_BUDGET_MS = 45_000;

export async function tick(runId: string, limit = 3): Promise<TickResult> {
  const db = serviceClient();
  const { params: icp } = await loadActiveIcp(db);

  // Fixtures run offline even if real keys exist.
  const { data: run } = await db.from("runs").select("source").eq("id", runId).maybeSingle();
  const source = (run as { source?: string } | null)?.source;
  const adapters = source === "fixtures" ? mockAdapters : getAdapters();

  const deadline = Date.now() + TICK_BUDGET_MS;
  const errors: { domain: string; error: string }[] = [];
  let claimedTotal = 0;
  let processedTotal = 0;

  while (Date.now() < deadline) {
    const { data: claimed, error } = await db.rpc("claim_companies" as never, {
      p_run: runId,
      p_limit: limit,
    } as never);
    if (error) throw new Error(`claim failed: ${error.message}`);
    const companies = (claimed ?? []) as { id: string; domain: string; run_id: string }[];
    if (companies.length === 0) break;
    claimedTotal += companies.length;

    const limiter = pLimit(limit);
    await Promise.all(
      companies.map((c) =>
        limiter(async () => {
          try {
            const result = await runCompany(c.domain, adapters, icp);
            await persistCompanyResult(db, c.id, runId, result);
            processedTotal += 1;
          } catch (err) {
            const msg = (err as Error).message.slice(0, 500);
            errors.push({ domain: c.domain, error: msg });
            await db
              .from("companies")
              .update({ stage: "error", error: msg, updated_at: new Date().toISOString() } as never)
              .eq("id", c.id);
          }
        }),
      ),
    );
  }

  // finalize run if nothing left queued/running
  const { count } = await db
    .from("companies")
    .select("id", { count: "exact", head: true })
    .eq("run_id", runId)
    .in("stage", ["queued", "running"]);
  if ((count ?? 0) === 0) {
    await db.from("runs").update({ finished_at: new Date().toISOString() } as never).eq("id", runId);
  }

  return { runId, claimed: claimedTotal, processed: processedTotal, errors };
}
