import { NextResponse } from "next/server";
import { implicitGlUserId } from "@/lib/auth/session";

export interface GlOk { ok: true; userId: string | null }
export interface GlErr { ok: false; res: NextResponse }

/**
 * Login was removed — every caller acts as the Growth Lead, so this always succeeds and
 * returns the implicit GL user id (for audit columns). The GlErr branch is retained so
 * existing `if (!gl.ok) return gl.res` guards still type-check.
 */
export async function requireGl(): Promise<GlOk | GlErr> {
  return { ok: true, userId: await implicitGlUserId() };
}
