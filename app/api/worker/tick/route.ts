import { NextRequest, NextResponse } from "next/server";
import { tick } from "@/lib/pipeline/worker";
import { serviceClient } from "@/lib/db/service";
import { env } from "@/lib/env";

export const maxDuration = 60;

async function authorized(req: NextRequest): Promise<boolean> {
  if (!env.WORKER_SECRET) return false;
  const header = req.headers.get("x-worker-secret");
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, ""); // Vercel Cron sends CRON_SECRET here
  const query = new URL(req.url).searchParams.get("secret");
  return [header, bearer, query].some((v) => v === env.WORKER_SECRET);
}

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { runId?: string; limit?: number };
  let runId = body.runId;
  if (!runId) {
    // process the oldest run that still has queued companies
    const db = serviceClient();
    const { data } = await db
      .from("companies")
      .select("run_id")
      .eq("stage", "queued")
      .limit(1)
      .maybeSingle();
    runId = (data as { run_id?: string } | null)?.run_id;
    if (!runId) return NextResponse.json({ idle: true });
  }
  const result = await tick(runId, body.limit ?? 3);
  return NextResponse.json(result);
}

// Vercel Cron calls GET; process any pending run.
export async function GET(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = serviceClient();
  const { data } = await db.from("companies").select("run_id").eq("stage", "queued").limit(1).maybeSingle();
  const runId = (data as { run_id?: string } | null)?.run_id;
  if (!runId) return NextResponse.json({ idle: true });
  const result = await tick(runId, 3);
  return NextResponse.json(result);
}
