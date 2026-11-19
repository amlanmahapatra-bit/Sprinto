import { NextRequest, NextResponse } from "next/server";
import { userClient } from "@/lib/db/server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await userClient();

  const { data: run } = await supabase.from("runs").select("*").eq("id", id).maybeSingle();
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { data: companies } = await supabase
    .from("companies")
    .select("*")
    .eq("run_id", id)
    .order("domain");
  return NextResponse.json({ run, companies: companies ?? [] });
}
