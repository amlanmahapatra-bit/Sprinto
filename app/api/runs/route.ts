import { NextRequest, NextResponse } from "next/server";
import { createRun } from "@/lib/pipeline/createRun";
import { parseDomains } from "@/lib/util/domain";
import { FIXTURE_DOMAINS } from "@/lib/fixtures/data";
import { requireGl } from "@/lib/api/guard";

export async function POST(req: NextRequest) {
  const gl = await requireGl();
  if (!gl.ok) return gl.res;

  const body = (await req.json()) as {
    source?: "paste" | "csv" | "discover" | "fixtures";
    mode?: "review" | "auto";
    domains?: string[];
  };
  const source = body.source ?? "paste";
  const mode = body.mode ?? "review";

  let domains: string[];
  if (source === "fixtures") {
    domains = FIXTURE_DOMAINS;
  } else {
    const parsed = parseDomains(body.domains ?? []);
    if (parsed.valid.length === 0) {
      return NextResponse.json({ error: "no valid domains", details: parsed.errors }, { status: 400 });
    }
    domains = parsed.valid;
  }

  const { runId, enqueued } = await createRun({ source, mode, domains, createdBy: gl.userId });
  return NextResponse.json({ runId, enqueued });
}
