import { NextRequest } from "next/server";
import { serviceClient } from "@/lib/db/service";
import crypto from "node:crypto";

const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export async function GET(req: NextRequest, { params }: { params: Promise<{ sendId: string }> }) {
  const { sendId: raw } = await params;
  const sendId = raw.replace(/\.gif$/i, "");

  // Record the open (service role; never exposes data).
  try {
    const db = serviceClient();
    const ua = req.headers.get("user-agent") ?? null;
    const ipRaw = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const ipHash = ipRaw ? crypto.createHash("sha256").update(ipRaw).digest("hex").slice(0, 32) : null;
    await db.from("email_events").insert({ send_id: sendId, type: "open", user_agent: ua, ip_hash: ipHash } as never);
  } catch {
    /* tracking must never fail the image */
  }

  return new Response(GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
