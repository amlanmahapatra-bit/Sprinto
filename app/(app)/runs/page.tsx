import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { userClient } from "@/lib/db/server";
import { Stat, LinkButton } from "@/components/ui";

// Reads live run/metrics data — never statically cache it.
export const dynamic = "force-dynamic";

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export default async function RunsPage() {
  await requireSession();
  const db = await userClient();

  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const [{ data: runs }, { data: companies }, { data: reviews }, { data: sends }, { data: events }] =
    await Promise.all([
      db.from("runs").select("*").order("started_at", { ascending: false }).limit(50),
      db.from("companies").select("id, run_id, verdict, stage, cost_usd, started_at, updated_at"),
      db.from("reviews").select("action, edit_ratio, reason_category, created_at"),
      db.from("sends").select("id, status, sent_at"),
      db.from("email_events").select("send_id, type"),
    ]);

  const comps = (companies ?? []) as Record<string, any>[];
  const revs = (reviews ?? []) as Record<string, any>[];
  const snds = (sends ?? []) as Record<string, any>[];
  const evs = (events ?? []) as Record<string, any>[];

  const sent = snds.filter((s) => s.status === "sent");
  const uniqueOpens = new Set(evs.filter((e) => e.type === "open").map((e) => e.send_id)).size;
  const openRate = sent.length ? uniqueOpens / sent.length : 0;

  const editRatios = revs.filter((r) => r.action !== "reject" && r.edit_ratio != null).map((r) => Number(r.edit_ratio));
  const medEdit = median(editRatios);
  const pctOver = editRatios.length ? editRatios.filter((r) => r > 0.5).length / editRatios.length : 0;

  const rejects: Record<string, number> = {};
  revs.filter((r) => r.action === "reject").forEach((r) => {
    const k = r.reason_category ?? "other";
    rejects[k] = (rejects[k] ?? 0) + 1;
  });

  const goReviewed = revs.length;
  const goApproved = revs.filter((r) => r.action !== "reject").length;
  const agreement = goReviewed ? goApproved / goReviewed : 0;

  const withTimes = comps.filter((c) => c.started_at && c.updated_at);
  const avgSecs = withTimes.length
    ? withTimes.reduce((a, c) => a + (new Date(c.updated_at).getTime() - new Date(c.started_at).getTime()) / 1000, 0) / withTimes.length
    : 0;
  const avgCost = comps.length ? comps.reduce((a, c) => a + Number(c.cost_usd || 0), 0) / comps.length : 0;
  const evidenceCoverage = comps.length
    ? comps.filter((c) => ["awaiting_review", "approved", "sent"].includes(c.stage)).length / comps.length
    : 0;
  const totalRejects = Object.values(rejects).reduce((a, b) => a + b, 0);

  const countsByRun = new Map<string, { total: number; go: number; sent: number; cost: number }>();
  comps.forEach((c) => {
    const r = countsByRun.get(c.run_id) ?? { total: 0, go: 0, sent: 0, cost: 0 };
    r.total += 1;
    if (c.verdict === "GO") r.go += 1;
    if (c.stage === "sent") r.sent += 1;
    r.cost += Number(c.cost_usd || 0);
    countsByRun.set(c.run_id, r);
  });

  const runList = (runs ?? []) as Record<string, any>[];

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Runs &amp; metrics</h1>
          <p className="mt-1 text-sm text-muted">Rolling 7 days, since {new Date(weekAgo).toLocaleDateString()}.</p>
        </div>
        <LinkButton href="/runs/new">New run</LinkButton>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Weekly roll-up</h2>
        <div className="grid grid-cols-2 divide-x divide-y divide-rule overflow-hidden rounded-card border border-border bg-surface md:grid-cols-4">
          <Stat label="Sent" value={sent.length} sub="emails to the demo inbox" />
          <Stat label="Unique opens" value={uniqueOpens} sub={`${(openRate * 100).toFixed(0)}% open rate`} />
          <Stat label="Median edit ratio" value={medEdit.toFixed(2)} sub={`${(pctOver * 100).toFixed(0)}% over 0.50`} />
          <Stat label="Qual. agreement" value={`${(agreement * 100).toFixed(0)}%`} sub={`${goApproved}/${goReviewed} GO approved`} />
          <Stat label="Avg time / company" value={`${avgSecs.toFixed(1)}s`} />
          <Stat label="Avg cost / company" value={`$${avgCost.toFixed(4)}`} />
          <Stat label="Evidence coverage" value={`${(evidenceCoverage * 100).toFixed(0)}%`} />
          <Stat label="Rejects" value={totalRejects} sub={Object.entries(rejects).map(([k, v]) => `${k} ${v}`).join(" · ") || "none"} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Runs <span className="font-normal text-muted">({runList.length})</span></h2>
        {runList.length === 0 ? (
          <div className="rounded-card border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
            No runs yet. <Link href="/runs/new" className="text-accent">Start one →</Link>
          </div>
        ) : (
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-normal text-muted">
                  <th className="px-4 py-2.5 font-normal">Run</th>
                  <th className="px-4 py-2.5 font-normal">Source</th>
                  <th className="px-4 py-2.5 font-normal">Companies</th>
                  <th className="px-4 py-2.5 text-right font-normal">Cost</th>
                  <th className="px-4 py-2.5 text-right font-normal">Started</th>
                </tr>
              </thead>
              <tbody>
                {runList.map((r) => {
                  const c = countsByRun.get(r.id) ?? { total: 0, go: 0, sent: 0, cost: 0 };
                  return (
                    <tr key={r.id} className="border-b border-rule last:border-0 hover:bg-raised">
                      <td className="px-4 py-3">
                        <Link href={`/runs/${r.id}`} className="mono text-accent">{r.id.slice(0, 8)}</Link>
                      </td>
                      <td className="px-4 py-3 text-muted">{r.source} · {r.mode} · icp v{r.icp_version}</td>
                      <td className="px-4 py-3 tabular-nums">
                        {c.total} <span className="text-muted">·</span> {c.go} GO <span className="text-muted">·</span> {c.sent} sent
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">${c.cost.toFixed(4)}</td>
                      <td className="px-4 py-3 text-right text-muted">{new Date(r.started_at).toLocaleDateString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
