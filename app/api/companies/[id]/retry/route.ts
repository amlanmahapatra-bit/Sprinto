import { NextRequest, NextResponse } from "next/server";
import { requireGl } from "@/lib/api/guard";
import { serviceClient } from "@/lib/db/service";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gl = await requireGl();
  if (!gl.ok) return gl.res;
  const { id } = await params;
  await serviceClient()
    .from("companies")
    .update({ stage: "queued", error: null, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  return NextResponse.json({ ok: true });
}
