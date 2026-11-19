import { serviceClient } from "@/lib/db/service";
import type { IcpParams } from "@/lib/engine/types";
import { ICP_V1 } from "@/lib/icp/defaults";

type SB = ReturnType<typeof serviceClient>;

export async function loadActiveIcp(db: SB): Promise<{ version: number; params: IcpParams }> {
  const { data } = await db
    .from("icp_config")
    .select("version, params")
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return { version: 1, params: ICP_V1 };
  return { version: (data as { version: number }).version, params: (data as { params: IcpParams }).params };
}
