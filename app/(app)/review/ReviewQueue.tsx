"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { VerdictBadge, Flag, Button } from "@/components/ui";
import { editRatio } from "@/lib/engine/editRatio";

export interface ReviewCard {
  companyId: string;
  domain: string;
  name: string;
  verdict: string | null;
  stage: string;
  flags: string[];
  draftId: string | null;
  subject: string;
  body: string;
  painCodes: string[];
  criticOverall: number | null;
  validatorOk: boolean | null;
  draftStatus: string | null;
  sendStatus: string | null;
}

const EDIT_REASONS = ["tone", "wrong_fact", "weak_hook", "wrong_pain", "too_long", "other"];
const REJECT_REASONS = ["bad_fit", "wrong_person", "bad_email", "already_customer", "other"];

const selectCls = "rounded-control border border-control/70 bg-surface px-2 py-1 text-sm focus:border-accent focus:outline-none";
const fieldCls = "rounded-control border border-control/70 bg-surface px-2.5 py-1.5 text-sm placeholder:text-faint focus:border-accent focus:outline-none";

export function ReviewQueue({ cards, canAct }: { cards: ReviewCard[]; canAct: boolean }) {
  const router = useRouter();
  const needsGl = cards.filter((c) => c.stage === "awaiting_review" && c.flags.length > 0);
  const ready = cards.filter((c) => c.stage === "awaiting_review" && c.flags.length === 0);
  const approved = cards.filter((c) => c.stage === "approved");
  const sent = cards.filter((c) => c.stage === "sent");
  const closed = cards.filter((c) => ["no_go", "hold", "rejected"].includes(c.stage));

  return (
    <div className="mt-6 space-y-8">
      <Section title="Needs GL" cards={needsGl} canAct={canAct} router={router} allowBulk={false} />
      <Section title="Ready" cards={ready} canAct={canAct} router={router} allowBulk />
      <Section title="Approved — ready to send" cards={approved} canAct={canAct} router={router} allowBulk={false} />
      <Section title="Sent" cards={sent} canAct={false} router={router} allowBulk={false} />
      <details className="group">
        <summary className="cursor-pointer select-none text-sm text-muted hover:text-text">
          NO_GO / HOLD / rejected ({closed.length})
        </summary>
        <div className="mt-3 overflow-hidden rounded-card border border-border bg-surface">
          {closed.map((c) => (
            <div key={c.companyId} className="flex items-center gap-3 border-b border-rule bg-panel px-3 py-2.5 text-sm last:border-0">
              <VerdictBadge verdict={c.verdict} />
              <span className="font-medium">{c.name}</span>
              <span className="mono text-xs text-muted">{c.domain}</span>
              <div className="flex flex-wrap gap-1">{c.flags.map((f) => <Flag key={f}>{f}</Flag>)}</div>
              <Link href={`/companies/${c.companyId}`} className="ml-auto text-accent hover:underline">Why?</Link>
            </div>
          ))}
          {closed.length === 0 ? <div className="px-3 py-2.5 text-sm text-muted">Empty.</div> : null}
        </div>
      </details>
    </div>
  );
}

function Section({
  title, cards, canAct, router, allowBulk,
}: {
  title: string; cards: ReviewCard[]; canAct: boolean; router: ReturnType<typeof useRouter>; allowBulk: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const bulkApprove = async () => {
    setBusy(true);
    for (const c of cards) {
      if (c.draftId && c.flags.length === 0) {
        await fetch(`/api/drafts/${c.draftId}/review`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "approve" }),
        });
      }
    }
    setBusy(false);
    router.refresh();
  };
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-base font-semibold">
          {title} <span className="font-normal text-muted">({cards.length})</span>
        </h2>
        {allowBulk && canAct && cards.length > 0 ? (
          <Button variant="ghost" disabled={busy} onClick={bulkApprove} className="!px-2 !py-1 text-xs">
            Bulk approve (unflagged)
          </Button>
        ) : null}
      </div>
      <div className="space-y-3">
        {cards.map((c) => <CardRow key={c.companyId} card={c} canAct={canAct} router={router} />)}
        {cards.length === 0 ? (
          <div className="rounded-card border border-border bg-surface px-4 py-6 text-sm text-muted">Empty.</div>
        ) : null}
      </div>
    </section>
  );
}

function CardRow({ card, canAct, router }: { card: ReviewCard; canAct: boolean; router: ReturnType<typeof useRouter> }) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(card.subject);
  const [body, setBody] = useState(card.body);
  const [reason, setReason] = useState("");
  const [reasonCat, setReasonCat] = useState(EDIT_REASONS[0]);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const ratio = useMemo(
    () => editRatio({ subject: card.subject, body: card.body }, { subject, body }),
    [card.subject, card.body, subject, body],
  );

  const review = async (action: "approve" | "edit_approve" | "reject", extra: Record<string, unknown> = {}) => {
    if (!card.draftId) return;
    setBusy(true);
    await fetch(`/api/drafts/${card.draftId}/review`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    setBusy(false);
    router.refresh();
  };

  const send = async () => {
    setBusy(true);
    const res = await fetch(`/api/sends/${card.companyId}`, { method: "POST" });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) alert(j.error ?? "send failed");
    router.refresh();
  };

  return (
    <div className="rounded-card border border-border bg-panel p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <VerdictBadge verdict={card.verdict} />
        <span className="font-medium">{card.name}</span>
        <span className="mono text-sm text-muted">{card.domain}</span>
        <span className="text-xs text-muted">pains {card.painCodes.join("+") || "—"}</span>
        {card.criticOverall != null ? <span className="text-xs text-muted">critic {card.criticOverall}</span> : null}
        <Link href={`/companies/${card.companyId}`} className="ml-auto text-sm text-accent hover:underline">Why?</Link>
      </div>
      {card.flags.length ? <div className="mt-2 flex flex-wrap gap-1">{card.flags.map((f) => <Flag key={f}>{f}</Flag>)}</div> : null}

      <div className="mt-3 space-y-2">
        {editing ? (
          <>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className={`${fieldCls} w-full`} />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={8} className={`${fieldCls} mono w-full text-xs`} />
            <div className="text-xs text-muted tabular-nums">edit ratio: {ratio.toFixed(2)}</div>
          </>
        ) : (
          <>
            <div className="text-sm font-medium">Subject: {card.subject || "—"}</div>
            <pre className="whitespace-pre-wrap rounded-control bg-raised p-3 font-sans text-sm leading-relaxed">{card.body || "— no draft —"}</pre>
          </>
        )}
      </div>

      {canAct && card.draftId && card.stage === "awaiting_review" ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!editing ? (
            <>
              <Button variant="primary" disabled={busy} onClick={() => review("approve")}>Approve</Button>
              <Button onClick={() => setEditing(true)}>Edit</Button>
              <Button variant="ghost" onClick={() => setRejecting((r) => !r)}>Reject</Button>
            </>
          ) : (
            <>
              <select value={reasonCat} onChange={(e) => setReasonCat(e.target.value)} className={selectCls}>
                {EDIT_REASONS.map((r) => <option key={r}>{r}</option>)}
              </select>
              <input placeholder="reason" value={reason} onChange={(e) => setReason(e.target.value)} className={fieldCls} />
              <Button
                variant="primary"
                disabled={busy || !reason}
                onClick={() => review("edit_approve", { final_subject: subject, final_body: body, reason_category: reasonCat, reason_text: reason })}
              >
                Save &amp; approve
              </Button>
              <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </>
          )}
          {rejecting ? (
            <div className="mt-2 flex w-full flex-wrap items-center gap-2">
              <select value={reasonCat} onChange={(e) => setReasonCat(e.target.value)} className={selectCls}>
                {REJECT_REASONS.map((r) => <option key={r}>{r}</option>)}
              </select>
              <input placeholder="reason" value={reason} onChange={(e) => setReason(e.target.value)} className={fieldCls} />
              <button
                disabled={busy || !reason}
                onClick={() => review("reject", { reason_category: reasonCat, reason_text: reason })}
                className="rounded-control border border-negative/50 px-3 py-1.5 text-sm font-medium text-negative hover:bg-[var(--pill-negative-bg)] disabled:opacity-50"
              >
                Confirm reject
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {canAct && card.stage === "approved" ? (
        <div className="mt-3">
          <button
            disabled={busy}
            onClick={send}
            className="inline-flex items-center rounded-control bg-positive px-3 py-1.5 text-sm font-semibold text-black hover:opacity-90 disabled:opacity-50"
          >
            Send to demo inbox
          </button>
        </div>
      ) : null}
      {card.stage === "sent" ? <div className="mt-3 text-sm font-medium text-positive">Sent ✓ ({card.sendStatus})</div> : null}
    </div>
  );
}
