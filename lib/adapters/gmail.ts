import { google } from "googleapis";
import { env, assertDemoRecipient } from "@/lib/env";
import type { OutboundEmail } from "@/lib/pipeline/types";

function b64url(s: string): string {
  return Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function buildMime(input: OutboundEmail): string {
  const boundary = `b_${Math.random().toString(36).slice(2)}`;
  const headers = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    `X-Intended-Recipient: ${input.intendedRecipient}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join("\r\n");

  const parts = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    input.textBody,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    input.htmlBody,
    "",
    `--${boundary}--`,
  ].join("\r\n");

  return `${headers}\r\n\r\n${parts}`;
}

export function htmlFromBody(body: string, pixelUrl: string): string {
  const esc = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
  return `<!doctype html><html><body>${esc}<img src="${pixelUrl}" width="1" height="1" alt=""></body></html>`;
}

/** Send via Gmail API with an OAuth2 refresh token. Asserts the DEMO_RECIPIENT boundary. */
export async function sendViaGmail(msg: OutboundEmail): Promise<{ messageId: string; threadId: string }> {
  assertDemoRecipient(msg.to);
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.GMAIL_REFRESH_TOKEN) {
    throw new Error("Gmail OAuth credentials missing (client id/secret/refresh token).");
  }
  const oauth2 = new google.auth.OAuth2(env.GMAIL_CLIENT_ID, env.GMAIL_CLIENT_SECRET);
  oauth2.setCredentials({ refresh_token: env.GMAIL_REFRESH_TOKEN });
  const gmail = google.gmail({ version: "v1", auth: oauth2 });
  const res = await gmail.users.messages.send({ userId: "me", requestBody: { raw: b64url(buildMime(msg)) } });
  return { messageId: res.data.id ?? "", threadId: res.data.threadId ?? "" };
}

/** Send via Gmail SMTP using an App Password. Asserts the DEMO_RECIPIENT boundary. */
export async function sendViaSmtp(msg: OutboundEmail): Promise<{ messageId: string; threadId: string }> {
  assertDemoRecipient(msg.to);
  if (!env.GMAIL_SENDER || !env.GMAIL_APP_PASSWORD) {
    throw new Error("Gmail SMTP credentials missing (GMAIL_SENDER / GMAIL_APP_PASSWORD).");
  }
  const nodemailer = (await import("nodemailer")).default;
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: env.GMAIL_SENDER, pass: env.GMAIL_APP_PASSWORD.replace(/\s+/g, "") },
  });
  const info = await transport.sendMail({ envelope: { from: env.GMAIL_SENDER, to: msg.to }, raw: buildMime(msg) });
  return { messageId: info.messageId ?? "", threadId: "" };
}

/** Send via the Resend HTTP API. Asserts the DEMO_RECIPIENT boundary.
 *  The `from` must be a Resend-verified domain, or the shared onboarding@resend.dev
 *  (which can only deliver to the account owner's own verified email — i.e. DEMO_RECIPIENT). */
export async function sendViaResend(msg: OutboundEmail): Promise<{ messageId: string; threadId: string }> {
  assertDemoRecipient(msg.to);
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY missing.");
  const from = env.RESEND_FROM || `${env.SENDER_NAME || "Sprinto Outreach"} <onboarding@resend.dev>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [msg.to],
      subject: msg.subject,
      html: msg.htmlBody,
      text: msg.textBody,
      headers: { "X-Intended-Recipient": msg.intendedRecipient },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${t.slice(0, 300)}`);
  }
  const json = (await res.json()) as { id?: string };
  return { messageId: json.id ?? "", threadId: "" };
}

/** Pick the configured transport: Resend if its key is set, else Gmail SMTP (App Password),
 *  else Gmail OAuth (Gmail API). Every path enforces the DEMO_RECIPIENT boundary. */
export async function deliverEmail(msg: OutboundEmail): Promise<{ messageId: string; threadId: string }> {
  if (env.RESEND_API_KEY) return sendViaResend(msg);
  if (env.GMAIL_APP_PASSWORD) return sendViaSmtp(msg);
  return sendViaGmail(msg);
}

/** True when a real email provider is configured, so the send can genuinely deliver even while
 *  the rest of the pipeline runs in deterministic fixture/mock mode. */
export function hasRealMailer(): boolean {
  return Boolean(
    env.RESEND_API_KEY ||
      env.GMAIL_APP_PASSWORD ||
      (env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN),
  );
}
