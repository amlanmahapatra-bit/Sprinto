import { serviceClient, type Db } from "@/lib/db/service";

/**
 * Login was removed, so there is no per-request user session. Server Components and route
 * handlers read and write through the service-role client. RLS stays enabled on the database
 * as defense in depth against direct anon/public access. SERVER ONLY — never import into a
 * client component.
 */
export async function userClient(): Promise<Db> {
  return serviceClient();
}

export async function currentUserRole(): Promise<"gl" | "viewer"> {
  // No login — every visitor has full (Growth Lead) access.
  return "gl";
}
