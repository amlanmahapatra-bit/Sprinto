import { NextRequest, NextResponse } from "next/server";
import { requireGl } from "@/lib/api/guard";
import { serviceClient } from "@/lib/db/service";
import { editRatio } from "@/lib/engine/editRatio";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gl = await requireGl();
  if (!gl.ok) return gl.res;
  const { id: draftId } = await params;

  const body = (await req.json()) as {
    action: "approve" | "edit_approve" | "reject";
    final_subject?: string;
    final_body?: string;
    reason_category?: string;
    reason_text?: string;
  };

  if ((body.action === "edit_approve" || body.action === "reject") && !body.reason_text) {
    return NextResponse.json({ error: "reason_text required for edit/reject" }, { status: 400 });
  }

  const db = serviceClient();
  const { data: draft } = await db
    .from("drafts")
    .select("id, company_id, subject, body")
    .eq("id", draftId)
    .maybeSingle();
  if (!draft) return NextResponse.json({ error: "draft not found" }, { status: 404 });
  const d = draft as { id: string; company_id: string; subject: string; body: string };

  const finalSubject = body.final_subject ?? d.subject;
  const finalBody = body.final_body ?? d.body;
  const ratio =
    body.action === "reject"
      ? null
      : editRatio({ subject: d.subject, body: d.body }, { subject: finalSubject, body: finalBody });

  await db.from("reviews").insert({
    draft_id: draftId,
    action: body.action,
    final_subject: finalSubject,
    final_body: finalBody,
    edit_ratio: ratio,
    reason_category: body.reason_category ?? null,
    reason_text: body.reason_text ?? null,
    reviewer: gl.userId,
  } as never);

  if (body.action === "reject") {
    await db.from("drafts").update({ status: "rejected" } as never).eq("id", draftId);
    await db.from("companies").update({ stage: "rejected" } as never).eq("id", d.company_id);
  } else {
    await db
      .from("drafts")
      .update({ status: "approved", subject: finalSubject, body: finalBody } as never)
      .eq("id", draftId);
    await db.from("companies").update({ stage: "approved" } as never).eq("id", d.company_id);
  }

  return NextResponse.json({ ok: true, edit_ratio: ratio });
}
