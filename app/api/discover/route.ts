import { NextResponse } from "next/server";
import { requireGl } from "@/lib/api/guard";
import { discoverCandidates } from "@/lib/pipeline/discover";

export const maxDuration = 60;

export async function POST() {
  const gl = await requireGl();
  if (!gl.ok) return gl.res;
  const candidates = await discoverCandidates();
  return NextResponse.json({ candidates });
}
