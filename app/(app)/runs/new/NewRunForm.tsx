"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseDomains, domainSchema, normalizeDomain } from "@/lib/util/domain";
import { Button } from "@/components/ui";

interface Candidate {
  company: string;
  domain: string | null;
  headline: string;
  date: string | null;
  source: string;
  url: string | null;
}

export function NewRunForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"review" | "auto">("review");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [domains, setDomains] = useState<Record<number, string>>({});
  const [picked, setPicked] = useState<Record<number, boolean>>({});

  const parsed = parseDomains(text.split(/\r?\n/));

  const createRun = async (source: string, domainList: string[]) => {
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source, mode, domains: domainList }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setErr(json.error ?? "failed");
    router.push(`/runs/${json.runId}`);
  };

  const onCsv = async (file: File) => {
    const content = await file.text();
    const p = parseDomains(content.split(/\r?\n/));
    setText(p.valid.join("\n"));
  };

  const discover = async () => {
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/discover", { method: "POST" });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setErr(json.error ?? "discover failed");
    const cands: Candidate[] = json.candidates ?? [];
    setCandidates(cands);
    setDomains(Object.fromEntries(cands.map((c, i) => [i, c.domain ?? ""])));
    setPicked({});
  };

  const selectedDomains = candidates
    .map((_, i) => (picked[i] && domainSchema.safeParse(domains[i] ?? "").success ? normalizeDomain(domains[i]) : null))
    .filter((d): d is string => Boolean(d));

  const inputCls =
    "w-full rounded-control border border-control/70 bg-surface px-3 py-2 text-sm placeholder:text-faint focus:border-accent focus:outline-none";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">New run</h1>
        <p className="mt-1 text-sm text-muted">Paste domains, upload a CSV, or discover companies that just raised.</p>
      </div>

      <section className="space-y-3">
        <label className="block text-sm font-medium">Domains</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder={"ledgerly.example\ntrustvault.example"}
          className={`${inputCls} mono`}
        />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="inline-flex cursor-pointer items-center rounded-control border border-control/70 bg-surface px-3 py-1.5 font-medium hover:bg-raised">
            Upload CSV
            <input type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && onCsv(e.target.files[0])} />
          </label>
          <span className="text-muted tabular-nums">
            {parsed.valid.length} valid · {parsed.errors.length} errors · {parsed.duplicatesRemoved} dupes removed
          </span>
        </div>
        {parsed.errors.length > 0 && (
          <ul className="space-y-0.5 text-xs text-negative">
            {parsed.errors.slice(0, 8).map((e, i) => (
              <li key={i}>{e.input}: {e.error}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">Mode</span>
          <div className="inline-flex rounded-control bg-raised p-0.5">
            {(["review", "auto"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-[4px] px-3 py-1 text-sm font-medium capitalize transition-colors ${
                  mode === m ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </section>

      {err ? <div className="rounded-control bg-[var(--pill-negative-bg)] px-3 py-2 text-sm text-[var(--pill-negative-ink)]">{err}</div> : null}

      <section className="flex flex-wrap gap-2.5">
        <Button variant="primary" disabled={busy || parsed.valid.length === 0} onClick={() => createRun("paste", parsed.valid)}>
          Run ({parsed.valid.length})
        </Button>
        <Button disabled={busy} onClick={discover}>{busy ? "Discovering…" : "Discover"}</Button>
        <Button disabled={busy} onClick={() => createRun("fixtures", [])}>Load fixtures (offline)</Button>
      </section>

      {candidates.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">
            Discovered <span className="font-normal text-muted">({candidates.length})</span>
            <span className="ml-2 text-sm font-normal text-muted">tick to run — add or fix a domain where it&apos;s blank</span>
          </h2>
          <div className="overflow-hidden rounded-card border border-border bg-surface">
            {candidates.map((c, i) => {
              const dom = domains[i] ?? "";
              const valid = domainSchema.safeParse(dom).success;
              return (
                <div key={i} className="flex items-start gap-3 border-b border-rule p-3 last:border-0 hover:bg-raised">
                  <input
                    type="checkbox"
                    disabled={!valid}
                    checked={!!picked[i]}
                    onChange={(e) => setPicked((p) => ({ ...p, [i]: e.target.checked }))}
                    className="mt-1.5 h-4 w-4 accent-[var(--accent)] disabled:opacity-40"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{c.company}</span>
                      <input
                        value={dom}
                        onChange={(e) => setDomains((d) => ({ ...d, [i]: e.target.value }))}
                        placeholder="company.com"
                        className={`mono w-48 rounded-control border bg-surface px-2 py-0.5 text-xs focus:outline-none ${
                          dom && !valid ? "border-negative" : "border-control/70 focus:border-accent"
                        }`}
                      />
                      {dom && !valid ? <span className="text-xs text-negative">invalid</span> : null}
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      {c.url ? (
                        <a href={c.url} target="_blank" rel="noreferrer" className="text-accent hover:underline">{c.headline}</a>
                      ) : (
                        c.headline
                      )}
                      {c.source ? ` · ${c.source}` : ""} {c.date ? `· ${new Date(c.date).toLocaleDateString()}` : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <Button variant="primary" disabled={busy || selectedDomains.length === 0} onClick={() => createRun("discover", selectedDomains)}>
            Run selected ({selectedDomains.length})
          </Button>
        </section>
      )}
    </div>
  );
}
