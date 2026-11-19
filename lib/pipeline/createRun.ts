import { serviceClient } from "@/lib/db/service";
import { loadActiveIcp } from "@/lib/icp/load";

export interface CreateRunInput {
  source: "paste" | "csv" | "discover" | "fixtures";
  mode: "review" | "auto";
  domains: string[];
  createdBy?: string | null;
}

/** Create a run row and enqueue one company per domain (deduped). */
export async function createRun(input: CreateRunInput): Promise<{ runId: string; enqueued: number }> {
  const db = serviceClient();
  const { version } = await loadActiveIcp(db);

  const { data: run, error } = await db
    .from("runs")
    .insert({
      icp_version: version,
      mode: input.mode,
      source: input.source,
      created_by: input.createdBy ?? null,
    } as never)
    .select("id")
    .single();
  if (error || !run) throw new Error(`createRun failed: ${error?.message}`);
  const runId = (run as { id: string }).id;

  const unique = [...new Set(input.domains.map((d) => d.trim().toLowerCase()).filter(Boolean))];
  if (unique.length) {
    await db.from("companies").insert(
      unique.map((domain) => ({ run_id: runId, domain, stage: "queued" })) as never,
    );
  }
  return { runId, enqueued: unique.length };
}
