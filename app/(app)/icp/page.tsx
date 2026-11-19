import { requireSession } from "@/lib/auth/session";
import { userClient } from "@/lib/db/server";
import { IcpEditor } from "./IcpEditor";

// Reads the live icp_config versions — never statically cache it.
export const dynamic = "force-dynamic";

export default async function IcpPage() {
  const s = await requireSession();
  const db = await userClient();
  const { data: versions } = await db.from("icp_config").select("*").order("version", { ascending: false });
  const list = (versions ?? []) as Record<string, any>[];
  const active = list.find((v) => v.is_active) ?? list[0];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">ICP settings</h1>
        <p className="mt-1 text-sm text-muted">
          Each run records the version it used. New versions take effect only after you activate them. No AI-suggested tuning.
        </p>
      </div>
      <IcpEditor
        active={active ? { version: active.version, params: active.params, note: active.note } : null}
        versions={list.map((v) => ({
          version: v.version,
          is_active: v.is_active,
          note: v.note,
          created_at: v.created_at,
          params: v.params,
        }))}
        canEdit={s.role === "gl"}
      />
    </div>
  );
}
