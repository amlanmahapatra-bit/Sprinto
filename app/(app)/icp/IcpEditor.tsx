"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

interface Version { version: number; is_active: boolean; note: string | null; created_at: string; params: unknown }

export function IcpEditor({
  active, versions, canEdit,
}: {
  active: { version: number; params: unknown; note: string | null } | null;
  versions: Version[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [json, setJson] = useState(JSON.stringify(active?.params ?? {}, null, 2));
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const prev = versions.find((v) => v.version === (active?.version ?? 0) - 1);
  const changedKeys = (() => {
    if (!prev) return [];
    try {
      const a = JSON.parse(json);
      const b = prev.params as Record<string, unknown>;
      return Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify((b as Record<string, unknown>)[k]));
    } catch {
      return [];
    }
  })();

  const createVersion = async () => {
    setBusy(true);
    setMsg(null);
    let params: unknown;
    try {
      params = JSON.parse(json);
    } catch {
      setBusy(false);
      return setMsg("Invalid JSON");
    }
    const res = await fetch("/api/icp-config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ params, note }),
    });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(j.error ?? "failed");
    setMsg(`Created version ${j.version} (inactive). Activate it below.`);
    router.refresh();
  };

  const activate = async (v: number) => {
    setBusy(true);
    await fetch(`/api/icp-config/${v}/activate`, { method: "POST" });
    setBusy(false);
    router.refresh();
  };

  return (
    <div className="space-y-8">
      <section className="rounded-card border border-border bg-surface p-5">
        <h2 className="mb-3 text-base font-semibold">Active · v{active?.version ?? "—"}</h2>
        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          rows={18}
          disabled={!canEdit}
          className="mono w-full rounded-control border border-control/70 bg-raised px-3 py-2 text-xs leading-relaxed focus:border-accent focus:outline-none disabled:opacity-70"
        />
        {prev ? (
          <div className="mt-2 text-xs text-muted">Changed vs v{prev.version}: {changedKeys.join(", ") || "none"}</div>
        ) : null}
        {canEdit ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <input
              placeholder="required note describing the change"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-w-0 flex-1 rounded-control border border-control/70 bg-surface px-2.5 py-1.5 text-sm placeholder:text-faint focus:border-accent focus:outline-none"
            />
            <Button variant="primary" disabled={busy || !note} onClick={createVersion}>Create new version</Button>
          </div>
        ) : null}
        {msg ? <div className="mt-3 rounded-control bg-raised px-3 py-2 text-sm text-text">{msg}</div> : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Version history</h2>
        <div className="overflow-hidden rounded-card border border-border bg-surface">
          {versions.map((v) => (
            <div key={v.version} className="flex items-center gap-3 border-b border-rule px-4 py-2.5 text-sm last:border-0">
              <span className="font-medium tabular-nums">v{v.version}</span>
              {v.is_active ? (
                <span className="rounded bg-[var(--pill-positive-bg)] px-2 py-0.5 text-xs font-medium text-[var(--pill-positive-ink)]">active</span>
              ) : null}
              <span className="truncate text-muted">{v.note}</span>
              <span className="ml-auto whitespace-nowrap text-xs text-muted">{new Date(v.created_at).toLocaleDateString()}</span>
              {canEdit && !v.is_active ? (
                <Button variant="secondary" disabled={busy} onClick={() => activate(v.version)} className="!px-2.5 !py-1 text-xs">
                  Activate
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
