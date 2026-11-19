#!/usr/bin/env tsx
// Seed a GL user for the demo / e2e, and ensure icp v1 is active.
//   SEED_GL_EMAIL / SEED_GL_PASSWORD in .env.local (defaults below).
import path from "node:path";
try {
  (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile(
    path.resolve(process.cwd(), ".env.local"),
  );
} catch { /* ambient env */ }

import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  const email = process.env.SEED_GL_EMAIL ?? "gl@sprinto-demo.test";
  const password = process.env.SEED_GL_PASSWORD ?? "sprinto-demo-pass-1";
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  let userId = created?.user?.id;
  if (error && !userId) {
    // already exists — find them
    const { data: list } = await admin.auth.admin.listUsers();
    userId = list?.users.find((u) => u.email === email)?.id;
  }
  if (!userId) {
    console.error("Could not create or find the seed user:", error?.message);
    process.exit(1);
  }
  await admin.from("profiles").upsert({ user_id: userId, role: "gl" });
  await admin.from("icp_config").update({ is_active: false }).neq("version", 1);
  await admin.from("icp_config").update({ is_active: true }).eq("version", 1);

  console.log(`✅ Seed GL user ready: ${email} / ${password}`);
  console.log("   icp_config v1 is active.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
