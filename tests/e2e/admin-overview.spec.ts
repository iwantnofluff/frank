import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";

// The admin area's Overview (decided directly, 4 Oct 2026): revenue, this
// month's plan changes, and the agencies that need a look. The fixture
// agency is put into each state and the overview is read for it.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ADMIN = "http://admin.frank.localhost:3000";
const PASSWORD = "E2e-Admin-Test-1234!";
const DAY = 24 * 3600_000;

async function makePlatformAdmin() {
  const email = `e2e-platform-admin-${Date.now()}@example.invalid`;
  const { data } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  const id = data.user!.id;
  await admin.from("users").insert({ id, email, name: "E2E Platform Admin" });
  await admin.from("platform_admins").insert({ user_id: id });
  return {
    email,
    async cleanup() {
      await admin.from("platform_admins").delete().eq("user_id", id);
      await admin.from("users").delete().eq("id", id);
      await admin.auth.admin.deleteUser(id);
    },
  };
}

async function signIn(page: Page, email: string) {
  await page.goto(`${ADMIN}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${ADMIN}/admin`, { timeout: 20_000 });
}

const group = (page: Page, name: string) => page.getByRole("region", { name, exact: true });

test("the overview reports plan changes, a trial ending, a failed payment and a limit nearly reached", async ({
  page,
  frank,
}) => {
  test.setTimeout(90_000);
  const pa = await makePlatformAdmin();
  try {
    // Starter → Free on a trial ending in three days (a downgrade)…
    await admin
      .from("agencies")
      .update({ plan: "free", trial_ends_at: new Date(Date.now() + 3 * DAY).toISOString() })
      .eq("id", frank.agencyId);
    await signIn(page, pa.email);
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    await expect(group(page, "Trials ending").locator(".srow", { hasText: "E2E Test Agency" })).toContainText("Ends");
    await expect(group(page, "Downgrades").locator(".srow", { hasText: "E2E Test Agency" })).toContainText(
      "Starter → Free",
    );
    await page.screenshot({ path: `${process.env.SHOT_DIR ?? "test-results"}/admin-overview.png`, animations: "disabled" });

    // …then Growth by card, its payment failing, its storage nearly full.
    await admin.from("agencies").update({ plan: "growth" }).eq("id", frank.agencyId);
    await admin.from("agency_billing").insert({
      agency_id: frank.agencyId,
      paddle_subscription_id: `sub_e2e_${Date.now()}`,
      status: "past_due",
      billing_interval: "monthly",
    });
    const { data: a } = await admin.from("agencies").select("storage_limit_bytes").eq("id", frank.agencyId).single();
    await admin
      .from("agencies")
      .update({ storage_bytes_used: Math.floor(a!.storage_limit_bytes * 0.9) })
      .eq("id", frank.agencyId);

    await page.reload();
    await expect(group(page, "Upgrades").locator(".srow", { hasText: "E2E Test Agency" })).toContainText("Free → Growth");
    await expect(group(page, "Failed payments").locator(".srow", { hasText: "E2E Test Agency" })).toBeVisible();
    await expect(group(page, "Revenue by plan").locator(".srow", { hasText: "Growth" })).toContainText("a month");
    await expect(group(page, "Near a limit").locator(".srow", { hasText: "E2E Test Agency" })).toContainText("Storage");
    await expect(group(page, "Trials ending").locator(".srow", { hasText: "E2E Test Agency" })).toHaveCount(0);

    // A row opens the agency.
    await group(page, "Failed payments").getByRole("link", { name: "E2E Test Agency" }).click();
    await page.waitForURL(`${ADMIN}/admin/agencies/${frank.agencyId}`, { timeout: 20_000 });
    // Its back arrow returns to the agencies list, now at its own address.
    await page.getByRole("link", { name: "Back to agencies" }).click();
    await page.waitForURL(`${ADMIN}/admin/agencies`);
    await expect(page.getByRole("heading", { name: "Agencies" })).toBeVisible();
  } finally {
    await pa.cleanup();
  }
});
