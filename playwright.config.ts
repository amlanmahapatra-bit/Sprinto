import path from "node:path";
import { defineConfig } from "@playwright/test";

// Load .env.local so the test process has the Supabase service key (used to reset state).
try {
  (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile(
    path.resolve(process.cwd(), ".env.local"),
  );
} catch {
  /* ambient env */
}

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },
  reporter: [["list"]],
});
