import { requireSession } from "@/lib/auth/session";
import { userClient } from "@/lib/db/server";
import { VerdictBadge, Flag, Card } from "@/components/ui";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const db = await userClient();

  const { data: company } = await db.from("companies").select("*").eq("id", id).maybeSingle();
  if (!company) return <div className="py-10 text-muted">Company not found.</div>;
  const c = company as Record<string, any>;

  const [{ data: qualRows }, { data: evidence }, { data: contacts }, { data: pains }, { data: drafts }, { data: research }] =
    await Promise.all([
      db.from("qualifications").select("*").eq("company_id", id).order("iteration"),
      db.from("evidence").select("*").eq("company_id", id).order("iteration"),
      db.from("contacts").select("*").eq("company_id", id),
      db.from("pain_points").select("*").eq("company_id", id).order("rank"),
      db.from("drafts").select("*").eq("company_id", id).order("version", { ascending: false }),
      db.from("research_steps").select("*").eq("company_id", id).order("iteration"),
    ]);

  const ev = (evidence ?? []) as Record<string, any>[];
  const quals = (qualRows ?? []) as Record<string, any>[];
  const finalQ = quals[quals.length - 1];
  const cps = (finalQ?.criterion_points ?? {}) as Record<string, number>;
  const draft = ((drafts ?? [])[0] ?? null) as Record<string, any> | null;
  const hookEv = ev.find((e) => e.id === draft?.hook_evidence_id);
  const contactList = ((contacts ?? []) as Record<string, any>[]).sort(
    (a, b) => Number(b.eligible) - Number(a.eligible) || (a.rank ?? 99) - (b.rank ?? 99),
  );

  const CRIT_LABEL: Record<string, string> = {
    C1: "SaaS", C2: "Funding stage", C3: "Compliance trigger", C4: "Headcount",
    C5: "Clients", C6: "Industry", C7: "Cloud",
  };
  const gated = Boolean(c.gates?.length);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/review" className="text-sm text-muted hover:text-text">← Review gate</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-[22px] font-semibold tracking-tight">{c.name ?? c.domain}</h1>
          <VerdictBadge verdict={c.verdict} />
          <span className="mono text-sm text-muted">{c.domain}</span>
        </div>
        {(c.gates?.length || c.flags?.length) ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {(c.gates ?? []).map((g: string) => <Flag key={g}>{g}</Flag>)}
            {(c.flags ?? []).map((f: string) => <Flag key={f}>{f}</Flag>)}
          </div>
        ) : null}
      </div>

      {/* Why this company */}
      <Card className="p-5">
        <h2 className="text-base font-semibold">Why this company</h2>
        <div className="mt-1 flex flex-wrap gap-x-4 text-sm text-muted">
          <span>Score <span className="font-medium tabular-nums text-text">{gated ? "—" : c.score}</span></span>
          <span>Confidence <span className="font-medium tabular-nums text-text">{c.confidence != null && !gated ? Number(c.confidence).toFixed(2) : "—"}</span></span>
          <span>Loops <span className="font-medium tabular-nums text-text">{c.loops_used}</span></span>
        </div>
        <table className="mt-4 w-full text-sm">
          <tbody>
            {Object.keys(CRIT_LABEL).map((k) => {
              const points = cps[k];
              const found = ev.some((e) => e.criterion === k);
              return (
                <tr key={k} className="border-t border-rule align-top">
                  <td className="w-44 py-2">{k} · {CRIT_LABEL[k]}</td>
                  <td className="w-16 py-2 font-medium tabular-nums">{points ?? 0} pts</td>
                  <td className="w-20 py-2 text-xs text-muted">{found ? "found" : "unknown"}</td>
                  <td className="py-2 text-xs text-muted">
                    {ev.filter((e) => e.criterion === k).map((e) => (
                      <div key={e.id}>
                        “{e.quote}” {e.source_url ? <a className="text-accent" href={e.source_url} target="_blank" rel="noreferrer">↗</a> : null}
                      </div>
                    ))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {quals.length > 1 && (
          <div className="mt-5 rounded-control bg-raised p-3">
            <div className="text-sm font-medium">Research-loop trace</div>
            <ul className="mt-1.5 space-y-0.5 text-sm text-muted">
              {quals.map((q, i) => (
                <li key={i} className="tabular-nums">
                  iter {q.iteration}: score {q.score}, conf {Number(q.confidence).toFixed(2)} → <span className="text-text">{q.decision}</span>
                </li>
              ))}
            </ul>
            <ul className="mt-2 space-y-0.5 text-xs text-muted">
              {((research ?? []) as Record<string, any>[]).map((r, i) => (
                <li key={i}>loop {r.iteration}: {r.tool} — {r.result_summary}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* Why this person */}
      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold">Why this person</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-normal">Name</th>
                <th className="py-2 pr-3 font-normal">Title</th>
                <th className="py-2 pr-3 font-normal">Persona / Tier</th>
                <th className="py-2 pr-3 font-normal">Conf</th>
                <th className="py-2 pr-3 font-normal">Verif</th>
                <th className="py-2 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {contactList.map((ct) => (
                <tr key={ct.id} className={`border-b border-rule last:border-0 ${ct.is_selected ? "bg-accent-tint" : ""}`}>
                  <td className="py-2 pr-3 font-medium">
                    {ct.first_name} {ct.last_name} {ct.is_selected ? <span className="text-accent">★</span> : null}
                  </td>
                  <td className="py-2 pr-3 text-muted">{ct.position}</td>
                  <td className="py-2 pr-3">{ct.persona ?? "—"}{ct.tier ? ` / T${ct.tier}` : ""}</td>
                  <td className="py-2 pr-3 tabular-nums">{ct.hunter_confidence ?? "—"}</td>
                  <td className="py-2 pr-3">{ct.verification_status ?? "—"}</td>
                  <td className="py-2 text-xs text-muted">{ct.selection_reason ?? (ct.eligible ? "eligible" : "excluded")}</td>
                </tr>
              ))}
              {contactList.length === 0 ? (
                <tr><td colSpan={6} className="py-3 text-muted">No contacts (Hunter runs only for GO companies).</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Why these pains */}
      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold">Why these pains</h2>
        <ul className="space-y-2.5 text-sm">
          {((pains ?? []) as Record<string, any>[]).map((p) => (
            <li key={p.id} className="flex gap-3">
              <span className="mt-0.5 shrink-0 font-medium text-accent-ink">{p.code}</span>
              <span className="text-muted"><span className="tabular-nums">score {p.score}</span> — {p.rationale}</span>
            </li>
          ))}
          {(pains ?? []).length === 0 ? <li className="text-muted">No pains (not a GO).</li> : null}
        </ul>
      </Card>

      {/* Why this email */}
      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold">Why this email</h2>
        {draft ? (
          <div className="space-y-3 text-sm">
            <div className="font-medium">Subject: {draft.subject}</div>
            <pre className="whitespace-pre-wrap rounded-control bg-raised p-3 font-sans text-sm leading-relaxed">{draft.body}</pre>
            <div className="text-xs text-muted">
              Hook evidence: {hookEv ? <>“{hookEv.quote}” {hookEv.source_url ? <a className="text-accent" href={hookEv.source_url} target="_blank" rel="noreferrer">↗</a> : null}</> : "—"}
            </div>
            <div className="text-xs text-muted">Claim ids: {(draft.claim_ids ?? []).join(", ")} · pain {draft.pain_code}</div>
            <div className="text-xs">
              <span className="text-muted">Validator:</span>{" "}
              {draft.validator?.ok ? (
                <span className="font-medium text-positive">pass</span>
              ) : (
                <span className="font-medium text-negative">fail ({(draft.validator?.failures ?? []).join(", ")})</span>
              )}
              <span className="text-muted"> · Critic overall: </span>
              <span className="tabular-nums">{draft.critic?.overall ?? "—"}</span>
            </div>
          </div>
        ) : (
          <div className="text-muted">No draft.</div>
        )}
      </Card>
    </div>
  );
}
