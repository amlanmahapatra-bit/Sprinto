#!/usr/bin/env tsx
// CLI: same engine as the UI. Offline fixtures or a CSV of domains.
//   npm run pipeline -- --fixtures
//   npm run pipeline -- --file data/domains_live.csv --mode review
import fs from "node:fs";
import path from "node:path";

// Load .env.local for the CLI (Next.js does this automatically for the app).
try {
  (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile(
    path.resolve(process.cwd(), ".env.local"),
  );
} catch {
  /* no .env.local — rely on the ambient environment */
}

import { getAdapters, mockAdapters } from "@/lib/adapters";
import { runCompany, type CompanyRunResult } from "@/lib/pipeline/engineRun";
import { ICP_V1 } from "@/lib/icp/defaults";
import { FIXTURE_DOMAINS } from "@/lib/fixtures/data";
import { parseDomains } from "@/lib/util/domain";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const hasFlag = (name: string) => process.argv.includes(name);

async function main() {
  const fixtures = hasFlag("--fixtures");
  const file = arg("--file");
  const mode = (arg("--mode") ?? "review") as "review" | "auto";

  let domains: string[];
  let adapters = getAdapters();

  if (fixtures) {
    domains = FIXTURE_DOMAINS;
    adapters = mockAdapters; // fixtures are always offline
  } else if (file) {
    const abs = path.resolve(process.cwd(), file);
    const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/);
    const parsed = parseDomains(lines);
    if (parsed.errors.length) {
      console.error("Row errors:");
      parsed.errors.forEach((e) => console.error(`  ${e.input}: ${e.error}`));
    }
    domains = parsed.valid;
  } else {
    console.error("Usage: npm run pipeline -- --fixtures | --file <csv> [--mode review|auto]");
    process.exit(1);
  }

  const runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  console.log(`\nRun ${runId} · mode ${mode} · ${adapters.kind} adapters · ${domains.length} domains\n`);

  const results: CompanyRunResult[] = [];
  for (const domain of domains) {
    try {
      const r = await runCompany(domain, adapters, ICP_V1);
      results.push(r);
    } catch (err) {
      console.error(`  ${domain}: ERROR ${(err as Error).message}`);
    }
  }

  printTable(results);

  const outDir = path.resolve(process.cwd(), "out");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `run-${runId}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ runId, mode, adapters: adapters.kind, results }, null, 2));
  console.log(`\nWrote ${outPath}\n`);
}

function printTable(results: CompanyRunResult[]) {
  const rows = results.map((r) => ({
    domain: r.domain,
    verdict: r.verdict,
    score: r.qualification.verdict === "NO_GO" && r.qualification.gates.length ? "-" : String(r.qualification.score),
    conf: r.qualification.gates.length ? "-" : r.qualification.confidence.toFixed(2),
    loops: String(r.qualification.loops_used),
    poc: r.poc ? `${r.poc.first_name} ${r.poc.last_name} (${r.poc.persona})` : "-",
    pains: r.pains.top.map((p) => p.code).join("+") || "-",
    flags: r.qualification.gates.length ? r.qualification.gates.join(",") : r.flags.join(",") || "-",
  }));
  const cols: { k: keyof (typeof rows)[number]; h: string }[] = [
    { k: "domain", h: "DOMAIN" },
    { k: "verdict", h: "VERDICT" },
    { k: "score", h: "SCORE" },
    { k: "conf", h: "CONF" },
    { k: "loops", h: "LOOPS" },
    { k: "poc", h: "POC" },
    { k: "pains", h: "PAINS" },
    { k: "flags", h: "FLAGS" },
  ];
  const widths = cols.map((c) => Math.max(c.h.length, ...rows.map((r) => String(r[c.k]).length)));
  const line = (vals: string[]) => vals.map((v, i) => v.padEnd(widths[i])).join("  ");
  console.log(line(cols.map((c) => c.h)));
  console.log(line(widths.map((w) => "-".repeat(w))));
  rows.forEach((r) => console.log(line(cols.map((c) => String(r[c.k])))));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
