import { NextRequest, NextResponse } from "next/server";
import { requireGl } from "@/lib/api/guard";
import { tick } from "@/lib/pipeline/worker";

export const maxDuration = 60;

// GL-authed tick for the open run (UI poll). Cron/CI use /api/worker/tick with the secret.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gl = await requireGl();
  if (!gl.ok) return gl.res;
  const { id } = await params;
  const result = await tick(id, 3);
  return NextResponse.json(result);
}
