"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { VerdictBadge, Flag } from "@/components/ui";

interface Company {
  id: string;
  domain: string;
  name: string | null;
  stage: string;
  verdict: string | null;
  score: number | null;
  confidence: number | null;
  loops_used: number;
  flags: string[];
  gates: string[];
  cost_usd: number;
  error: string | null;
}

const ACTIVE = new Set(["queued", "running"]);

const STAGE_STYLE: Record<string, string> = {
  queued: "text-muted",
  running: "text-accent-ink",
  awaiting_review: "text-text",
  approved: "text-text",
  sent: "text-positive",
  hold: "text-warning",
  no_go: "text-muted",
  rejected: "text-negative",
  error: "text-negative",
};

export function RunProgress({ runId, canRun }: { runId: string; canRun: boolean }) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [ticking, setTicking] = useState(false);
  const stop = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${runId}`);
      if (res.ok) {
        const json = await res.json();
        setCompanies(json.companies ?? []);
        return json.companies as Company[];
      }
    } catch {
      /* transient — keep polling */
    }
    return [];
  }, [runId]);

  const tick = useCallback(async () => {
    if (!canRun) return;
    setTicking(true);
    await fetch(`/api/runs/${runId}/tick`, { method: "POST" }).catch(() => {});
    setTicking(false);
  }, [runId, canRun]);

  useEffect(() => {
    stop.current = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      const list = await load();
      const active = list.some((c) => ACTIVE.has(c.stage));
      if (active && canRun) await tick();
      if (!stop.current) timer = setTimeout(loop, active ? 2500 : 6000);
    };
    loop();
    return () => {
      stop.current = true;
      clearTimeout(timer);
    };
  }, [load, tick, canRun]);

  const retry = async (id: string) => {
    await fetch(`/api/companies/${id}/retry`, { method: "POST" });
    await load();
  };

  const totalCost = companies.reduce((a, c) => a + Number(c.cost_usd || 0), 0);
  const done = companies.filter((c) => !ACTIVE.has(c.stage)).length;
  const total = companies.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium tabular-nums">{done}/{total || "…"} done</span>
          {ticking ? <span className="text-accent">working…</span> : null}
        </div>
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-raised">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-sm text-muted tabular-nums">cost ${totalCost.toFixed(4)}</span>
      </div>

      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              {["Company", "Stage", "Verdict", "Score", "Conf", "Loops", "Flags", ""].map((h, i) => (
                <th key={h || i} className={`px-4 py-2.5 font-normal ${["Score", "Conf", "Loops"].includes(h) ? "text-right" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className="border-b border-rule last:border-0 hover:bg-raised">
                <td className="px-4 py-3">
                  <div className="font-medium">{c.name ?? c.domain}</div>
                  <div className="mono text-xs text-muted">{c.domain}</div>
                </td>
                <td className={`px-4 py-3 ${STAGE_STYLE[c.stage] ?? "text-muted"}`}>{c.stage}</td>
                <td className="px-4 py-3"><VerdictBadge verdict={c.verdict} /></td>
                <td className="px-4 py-3 text-right tabular-nums">{c.score ?? "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{c.confidence != null ? Number(c.confidence).toFixed(2) : "—"}</td>
                <td className="px-4 py-3 text-right tabular-nums">{c.loops_used}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {[...(c.gates ?? []), ...(c.flags ?? [])].map((f) => <Flag key={f}>{f}</Flag>)}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  {c.stage === "error" && canRun ? (
                    <button onClick={() => retry(c.id)} className="text-sm text-accent hover:underline">Retry</button>
                  ) : (
                    <Link href={`/companies/${c.id}`} className="text-sm text-accent hover:underline">Why?</Link>
                  )}
                </td>
              </tr>
            ))}
            {companies.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-muted">Starting run…</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
