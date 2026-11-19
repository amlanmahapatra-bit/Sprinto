import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

// Start from a clean pipeline so the review queue holds exactly this run's companies.
// Deleting runs cascades to companies and every child row; profiles + icp_config are kept.
test.beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("e2e needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (load .env.local)");
  const admin = createClient(url, key, { auth: { persistSession: false } });
  await admin.from("runs").delete().neq("id", "00000000-0000-0000-0000-000000000000");
});

test("fixture run → review → edit-approve → send to demo inbox → metrics", async ({ page }) => {
  // No login — the app opens straight to the tool as the Growth Lead.
  // New run → Load fixtures (offline)
  await page.goto("/runs/new");
  await page.getByRole("button", { name: /Load fixtures/ }).click();
  await page.waitForURL(/\/runs\/[0-9a-f-]+$/);

  // Wait for all 5 companies to finish.
  await expect(page.getByText(/5\/5 done/)).toBeVisible({ timeout: 90_000 });

  // Verdicts: 2 GO, 1 HOLD, 2 NO_GO
  await expect(page.getByText("GO", { exact: true })).toHaveCount(2);
  await expect(page.getByText("HOLD", { exact: true })).toHaveCount(1);
  await expect(page.getByText("NO_GO", { exact: true })).toHaveCount(2);

  // Review gate: TrustVault card in "Needs GL" shows both flags. Scope to its card
  // (a bg-panel CardRow) so the assertion targets TrustVault specifically — MegaCorp
  // (NO_GO) also carries ALREADY_CERTIFIED in the separate "closed" section.
  await page.goto("/review");
  const trustvaultCard = page
    .locator("div.bg-panel")
    .filter({ has: page.getByText("TrustVault", { exact: true }) });
  await expect(trustvaultCard).toBeVisible();
  await expect(trustvaultCard.getByText("ALREADY_CERTIFIED")).toBeVisible();
  await expect(trustvaultCard.getByText("COMPETITOR_CUSTOMER")).toBeVisible();

  // Edit & approve Ledgerly (unflagged → in Ready). Scope to its card so the Edit/Save
  // controls are unambiguous.
  const ledgerlyCard = page.locator("div.bg-panel").filter({ has: page.getByText("Ledgerly", { exact: true }) });
  await ledgerlyCard.getByRole("button", { name: "Edit" }).click();
  const body = ledgerlyCard.locator("textarea");
  await body.fill((await body.inputValue()) + "\n\nLooking forward to it.");
  await ledgerlyCard.getByPlaceholder("reason").fill("tightened the close");
  await ledgerlyCard.getByRole("button", { name: /Save & approve/ }).click();

  // Approval persists and the card moves to "Approved — ready to send" via the handler's
  // router.refresh(), so wait for the send button to appear rather than racing a reload.
  const approvedCard = page.locator("div.bg-panel").filter({ has: page.getByText("Ledgerly", { exact: true }) });
  const sendBtn = approvedCard.getByRole("button", { name: /Send to demo inbox/ });
  await expect(sendBtn).toBeVisible({ timeout: 30_000 });
  await sendBtn.click();
  // Card moves to the "Sent" section showing "Sent ✓" (scoped so it doesn't match the section header).
  await expect(approvedCard.getByText(/Sent/)).toBeVisible({ timeout: 20_000 });

  // Metrics show an edit ratio
  await page.goto("/runs");
  await expect(page.getByText("Median edit ratio")).toBeVisible();
});
