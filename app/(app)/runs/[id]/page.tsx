import { requireSession } from "@/lib/auth/session";
import { RunProgress } from "./RunProgress";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  return (
    <div className="space-y-1">
      <h1 className="text-[22px] font-semibold tracking-tight">Run progress</h1>
      <p className="mono text-sm text-muted">{id}</p>
      <RunProgress runId={id} canRun={s.role === "gl"} />
    </div>
  );
}
