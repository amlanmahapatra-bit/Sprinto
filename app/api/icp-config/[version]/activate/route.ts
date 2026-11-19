import { NextRequest, NextResponse } from "next/server";
import { requireGl } from "@/lib/api/guard";
import { serviceClient } from "@/lib/db/service";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ version: string }> }) {
  const gl = await requireGl();
  if (!gl.ok) return gl.res;
  const { version } = await params;
  const v = Number(version);
  if (!Number.isInteger(v)) return NextResponse.json({ error: "bad version" }, { status: 400 });

  const db = serviceClient();
  const { data: exists } = await db.from("icp_config").select("version").eq("version", v).maybeSingle();
  if (!exists) return NextResponse.json({ error: "version not found" }, { status: 404 });

  // Deactivate others first (partial unique index allows exactly one active).
  await db.from("icp_config").update({ is_active: false } as never).neq("version", v);
  const { error } = await db.from("icp_config").update({ is_active: true } as never).eq("version", v);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ version: v, active: true });
}
