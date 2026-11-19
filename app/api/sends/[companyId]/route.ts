import { NextRequest, NextResponse } from "next/server";
import { requireGl } from "@/lib/api/guard";
import { serviceClient } from "@/lib/db/service";
import { getAdapters } from "@/lib/adapters";
import { htmlFromBody, deliverEmail, hasRealMailer } from "@/lib/adapters/gmail";
import { env, assertDemoRecipient } from "@/lib/env";

export const maxDuration = 30;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ companyId: string }> }) {
  const gl = await requireGl();
  if (!gl.ok) return gl.res;
  const { companyId } = await params;
  const db = serviceClient();

  const { data: company } = await db
    .from("companies")
    .select("id, run_id, domain, name, stage")
    .eq("id", companyId)
    .maybeSingle();
  if (!company) return NextResponse.json({ error: "company not found" }, { status: 404 });
  const c = company as { id: string; run_id: string; domain: string; name: string | null; stage: string };

  const { data: draft } = await db
    .from("drafts")
    .select("id, subject, body, contact_id, status")
    .eq("company_id", companyId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!draft) return NextResponse.json({ error: "no draft" }, { status: 400 });
  const d = draft as { id: string; subject: string; body: string; contact_id: string | null; status: string };
  if (d.status !== "approved") return NextResponse.json({ error: "draft not approved" }, { status: 400 });

  let intended = "unknown@" + c.domain;
  let poc = { first: "", last: "", title: "" };
  if (d.contact_id) {
    const { data: contact } = await db
      .from("contacts")
      .select("email, first_name, last_name, position")
      .eq("id", d.contact_id)
      .maybeSingle();
    const ct = contact as { email?: string; first_name?: string; last_name?: string; position?: string } | null;
    if (ct?.email) intended = ct.email;
    poc = { first: ct?.first_name ?? "", last: ct?.last_name ?? "", title: ct?.position ?? "" };
  }

  // Idempotency: reuse existing send row for (run, company).
  const { data: existing } = await db
    .from("sends")
    .select("id, status, gmail_message_id")
    .eq("run_id", c.run_id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (existing && (existing as { status: string }).status === "sent") {
    return NextResponse.json({ ok: true, already: true, send: existing });
  }

  // Daily cap
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await db
    .from("sends")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .gte("sent_at", since);
  if ((count ?? 0) >= env.MAX_SENDS_PER_DAY) {
    return NextResponse.json({ error: "daily send cap reached" }, { status: 429 });
  }

  const to = env.DEMO_RECIPIENT;
  try {
    assertDemoRecipient(to);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  // Ensure a send row exists (pending) to get its id for the pixel.
  let sendId: string;
  if (existing) {
    sendId = (existing as { id: string }).id;
  } else {
    const { data: ins, error } = await db
      .from("sends")
      .insert({
        run_id: c.run_id,
        company_id: companyId,
        draft_id: d.id,
        to_address: to,
        intended_address: intended,
        status: "pending",
      } as never)
      .select("id")
      .single();
    if (error || !ins) return NextResponse.json({ error: error?.message ?? "send row failed" }, { status: 500 });
    sendId = (ins as { id: string }).id;
  }

  const footer = `\n\n— Demo send. Intended for ${poc.first} ${poc.last}, ${poc.title}, ${c.domain}.`;
  const textBody = d.body + footer;
  const pixel = `${env.APP_BASE_URL}/api/t/o/${sendId}.gif`;
  const htmlBody = htmlFromBody(textBody, pixel);
  const fromAddr = env.GMAIL_SENDER || env.DEMO_RECIPIENT;
  const outbound = {
    to,
    from: `${env.SENDER_NAME} <${fromAddr}>`,
    subject: d.subject,
    textBody,
    htmlBody,
    intendedRecipient: intended,
  };

  try {
    // A configured real provider (Resend / Gmail) sends for real, even when the pipeline
    // itself is in fixture/mock mode; otherwise the mock adapter records the send.
    const sent = hasRealMailer() ? await deliverEmail(outbound) : await getAdapters().sendEmail(outbound);
    await db
      .from("sends")
      .update({
        status: "sent",
        gmail_message_id: sent.messageId,
        gmail_thread_id: sent.threadId,
        sent_at: new Date().toISOString(),
      } as never)
      .eq("id", sendId);
    await db.from("companies").update({ stage: "sent" } as never).eq("id", companyId);
    return NextResponse.json({ ok: true, sendId, to, intended, messageId: sent.messageId });
  } catch (e) {
    const msg = (e as Error).message.slice(0, 500);
    await db.from("sends").update({ status: "error", error: msg } as never).eq("id", sendId);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
