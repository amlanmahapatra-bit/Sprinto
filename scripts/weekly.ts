#!/usr/bin/env tsx
// Weekly scheduled run: Discover -> create a run in REVIEW mode -> tick until done.
// Drafts wait for the GL in the review queue. Run from GitHub Actions with secrets.
import path from "node:path";
try {
  (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile(
    path.resolve(process.cwd(), ".env.local"),
  );
} catch { /* rely on ambient env (GitHub secrets) */ }

import { discoverCandidates } from "@/lib/pipeline/discover";
import { createRun } from "@/lib/pipeline/createRun";
import { tick } from "@/lib/pipeline/worker";

async function main() {
  const candidates = await discoverCandidates();
  const domains = candidates.map((c) => c.domain).filter((d): d is string => Boolean(d));
  console.log(`Discovered ${candidates.length} candidates, ${domains.length} with domains.`);
  if (domains.length === 0) {
    console.log("Nothing to run.");
    return;
  }
  const { runId, enqueued } = await createRun({ source: "discover", mode: "review", domains });
  console.log(`Created run ${runId} with ${enqueued} companies (review mode).`);

  // Drain the queue.
  for (let i = 0; i < 50; i++) {
    const r = await tick(runId, 3);
    console.log(`tick: claimed ${r.claimed}, processed ${r.processed}, errors ${r.errors.length}`);
    if (r.claimed === 0) break;
  }
  console.log(`Run ${runId} complete. Drafts await the GL in the review queue.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
