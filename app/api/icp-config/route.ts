import { NextRequest, NextResponse } from "next/server";
import { requireGl } from "@/lib/api/guard";
import { serviceClient } from "@/lib/db/service";
import { SPRINTO_CONTEXT_VERSION } from "@/lib/icp/defaults";

export async function POST(req: NextRequest) {
  const gl = await requireGl();
  if (!gl.ok) return gl.res;
  const body = (await req.json()) as { params?: unknown; note?: string; sprinto_context_version?: string };
  if (!body.params) return NextResponse.json({ error: "params required" }, { status: 400 });
  if (!body.note) return NextResponse.json({ error: "note required for a new version" }, { status: 400 });

  const db = serviceClient();
  const { data: latest } = await db
    .from("icp_config")
    .select("version")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const next = ((latest as { version?: number } | null)?.version ?? 0) + 1;

  const { error } = await db.from("icp_config").insert({
    version: next,
    params: body.params as never,
    sprinto_context_version: body.sprinto_context_version ?? SPRINTO_CONTEXT_VERSION,
    note: body.note,
    created_by: gl.userId,
    is_active: false,
  } as never);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ version: next, active: false });
}
