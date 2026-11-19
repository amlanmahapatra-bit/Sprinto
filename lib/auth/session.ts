import { serviceClient, hasServiceDb } from "@/lib/db/service";

export interface SessionInfo {
  userId: string | null;
  email: string;
  role: "gl" | "viewer";
}

// Login was removed: every visitor acts as the single Growth Lead. The implicit GL identity
// is resolved once from the seeded `gl` profile and used only for audit columns
// (runs.created_by, reviews.reviewer, icp_config.created_by), which are nullable.
let _glId: string | null | undefined;
export async function implicitGlUserId(): Promise<string | null> {
  if (_glId !== undefined) return _glId;
  if (!hasServiceDb()) {
    _glId = null;
    return _glId;
  }
  try {
    const { data } = await serviceClient()
      .from("profiles")
      .select("user_id")
      .eq("role", "gl")
      .limit(1)
      .maybeSingle();
    _glId = (data as { user_id?: string } | null)?.user_id ?? null;
  } catch {
    _glId = null;
  }
  return _glId;
}

export async function getSession(): Promise<SessionInfo> {
  return { userId: await implicitGlUserId(), email: "Growth Lead", role: "gl" };
}

export async function requireSession(): Promise<SessionInfo> {
  return getSession();
}
