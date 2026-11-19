import { requireSession } from "@/lib/auth/session";
import { userClient } from "@/lib/db/server";
import { ReviewQueue, type ReviewCard } from "./ReviewQueue";

// Reads live pipeline data — never statically cache it.
export const dynamic = "force-dynamic";

const QUEUE_STAGES = ["awaiting_review", "approved", "sent", "hold", "no_go", "rejected"];

export default async function ReviewPage() {
  const s = await requireSession();
  const db = await userClient();

  const { data: companies } = await db
    .from("companies")
    .select("id, domain, name, verdict, flags, gates, stage, score")
    .in("stage", QUEUE_STAGES)
    .order("updated_at", { ascending: false })
    .limit(200);

  const comps = (companies ?? []) as Record<string, any>[];
  const ids = comps.map((c) => c.id);

  const [{ data: drafts }, { data: pains }, { data: sends }] = await Promise.all([
    ids.length ? db.from("drafts").select("*").in("company_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? db.from("pain_points").select("company_id, code, rank").in("company_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? db.from("sends").select("company_id, status, to_address").in("company_id", ids) : Promise.resolve({ data: [] }),
  ]);

  const draftByCompany = new Map<string, Record<string, any>>();
  ((drafts ?? []) as Record<string, any>[]).forEach((d) => {
    const prev = draftByCompany.get(d.company_id);
    if (!prev || d.version > prev.version) draftByCompany.set(d.company_id, d);
  });
  const painsByCompany = new Map<string, string[]>();
  ((pains ?? []) as Record<string, any>[]).forEach((p) => {
    const arr = painsByCompany.get(p.company_id) ?? [];
    arr[p.rank - 1] = p.code;
    painsByCompany.set(p.company_id, arr);
  });
  const sendByCompany = new Map<string, Record<string, any>>();
  ((sends ?? []) as Record<string, any>[]).forEach((s2) => sendByCompany.set(s2.company_id, s2));

  const cards: ReviewCard[] = comps.map((c) => {
    const d = draftByCompany.get(c.id);
    return {
      companyId: c.id,
      domain: c.domain,
      name: c.name ?? c.domain,
      verdict: c.verdict,
      stage: c.stage,
      flags: [...(c.gates ?? []), ...(c.flags ?? [])],
      draftId: d?.id ?? null,
      subject: d?.subject ?? "",
      body: d?.body ?? "",
      painCodes: (painsByCompany.get(c.id) ?? []).filter(Boolean),
      criticOverall: d?.critic?.overall ?? null,
      validatorOk: d?.validator?.ok ?? null,
      draftStatus: d?.status ?? null,
      sendStatus: sendByCompany.get(c.id)?.status ?? null,
    };
  });

  return (
    <div>
      <h1 className="text-[22px] font-semibold tracking-tight">Review gate</h1>
      <p className="mt-1 text-sm text-muted">Nothing is sent to anyone except the demo inbox.</p>
      <ReviewQueue cards={cards} canAct={s.role === "gl"} />
    </div>
  );
}
