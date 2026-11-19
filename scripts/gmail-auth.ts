#!/usr/bin/env tsx
// One-time: mint a Gmail refresh token with the gmail.send scope.
//   1. In Google Cloud: enable Gmail API, create an OAuth client (type: Web application)
//      with redirect URI http://localhost:4875/oauth2callback, add yourself as a test user.
//   2. Put GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET in .env.local, then: npm run gmail:auth
//   3. Approve in the browser; the printed refresh token goes into GMAIL_REFRESH_TOKEN.
import path from "node:path";
import http from "node:http";
import { google } from "googleapis";

try {
  (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile(
    path.resolve(process.cwd(), ".env.local"),
  );
} catch { /* rely on ambient env */ }

const PORT = 4875;
const REDIRECT = `http://localhost:${PORT}/oauth2callback`;
const SCOPE = "https://www.googleapis.com/auth/gmail.send";

async function main() {
  const id = process.env.GMAIL_CLIENT_ID;
  const secret = process.env.GMAIL_CLIENT_SECRET;
  if (!id || !secret) {
    console.error("Set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in .env.local first.");
    process.exit(1);
  }
  const oauth2 = new google.auth.OAuth2(id, secret, REDIRECT);
  const url = oauth2.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: [SCOPE] });
  console.log("\nOpen this URL in your browser and approve:\n\n" + url + "\n");

  const code: string = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url?.startsWith("/oauth2callback")) {
        res.writeHead(404).end();
        return;
      }
      const u = new URL(req.url, `http://localhost:${PORT}`);
      const c = u.searchParams.get("code");
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<h3>Done. You can close this tab and return to the terminal.</h3>");
      server.close();
      c ? resolve(c) : reject(new Error("no code"));
    });
    server.listen(PORT, () => console.log(`Waiting for the redirect on ${REDIRECT} ...`));
  });

  const { tokens } = await oauth2.getToken(code);
  if (!tokens.refresh_token) {
    console.error("No refresh token returned. Remove the app's access in your Google account and retry (prompt=consent).");
    process.exit(1);
  }
  console.log("\n✅ Add this to .env.local and your Vercel/GitHub secrets:\n");
  console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
