import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { test, expect, APP_PORT, PHONE_VIEWPORT } from "./fixtures";

// The admin area's Workspaces and a workspace's page (decided directly,
// 2 Nov 2026): search, filters and sorting; Internal, which leaves a
// workspace out of the Overview; the page's tabs; the version in the
// header; and the menu behind a button on a phone.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ADMIN = `http://admin.frank.localhost:${APP_PORT}`;
const PASSWORD = "E2e-Admin-Test-1234!";

async function makePlatformAdmin() {
  const email = `e2e-platform-admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;
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

test("workspaces are searched, filtered and sorted; Internal leaves one out of the Overview", async ({ page, frank }) => {
  test.setTimeout(120_000);
  const pa = await makePlatformAdmin();
  try {
    await signIn(page, pa.email);
    // The version this site runs, in the header.
    await expect(page.locator(".adminbar-v")).toHaveText(/^1\.\d+/);

    await page.goto(`${ADMIN}/admin/agencies`);
    // This test's workspace, by its id: other tests run beside it with
    // workspaces of the same name.
    const link = `a[href="/admin/agencies/${frank.agencyId}"]`;
    const rowFor = page.locator(".admintbl tbody tr", { has: page.locator(link) });
    await expect(rowFor).toHaveCount(1, { timeout: 20_000 });

    // Search by name, in any case, keeps it; nonsense finds nothing.
    const search = page.getByLabel("Search workspaces");
    await search.fill("e2e test agency");
    await expect(rowFor).toHaveCount(1);
    await expect(page.locator(".admintbl tbody tr", { hasNotText: "E2E Test Agency" })).toHaveCount(0);
    await search.fill("no-such-workspace-xyz");
    await expect(page.getByText("No workspace matches that.")).toBeVisible();
    await search.fill("");

    // The plan filter: it's on Starter.
    await page.getByLabel("Plan").selectOption("growth");
    await expect(rowFor).toHaveCount(0);
    await page.getByLabel("Plan").selectOption("starter");
    await expect(rowFor).toHaveCount(1);
    await page.getByLabel("Plan").selectOption("all");

    // Sorting by name, then reversed.
    const names = () => page.locator(".admintbl tbody tr .admintbl-name").allTextContents();
    await page.getByRole("button", { name: /^Workspace/ }).click();
    const az = await names();
    expect(az).toEqual([...az].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
    await page.getByRole("button", { name: /^Workspace/ }).click();
    expect(await names()).toEqual([...az].reverse());

    // The page's tabs, then Internal.
    await rowFor.locator(".admintbl-name").click();
    await page.waitForURL(`${ADMIN}/admin/agencies/${frank.agencyId}`);
    await expect(page.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "People" }).click();
    await expect(page.getByText(/here, team and clients/)).toBeVisible();
    await page.getByRole("tab", { name: "Overview" }).click();
    await expect(page.getByRole("heading", { name: "Limits" }).or(page.locator(".msection-h", { hasText: "Limits" }))).toBeVisible();
    await page.getByRole("button", { name: "Mark as Internal" }).click();
    await expect(page.getByRole("button", { name: "Count as a Customer" })).toBeVisible({ timeout: 20_000 });
    expect((await admin.from("agencies").select("is_internal").eq("id", frank.agencyId).single()).data!.is_internal).toBe(true);

    // Out of the customers list, in the internal one, out of the Overview.
    await page.goto(`${ADMIN}/admin/agencies`);
    // Loaded once the count of internal ones shows (it may be the only one).
    await expect(page.locator(".adminhead .sub")).toContainText("internal", { timeout: 20_000 });
    await expect(rowFor).toHaveCount(0);
    await page.getByLabel("Which workspaces").selectOption("internal");
    await expect(rowFor).toHaveCount(1);
    await expect(rowFor.locator(".tag", { hasText: "Internal" })).toBeVisible();
    await page.goto(`${ADMIN}/admin`);
    await expect(page.getByText(/internal workspace.? left out of these figures/)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(`.srow ${link}`)).toHaveCount(0);
  } finally {
    await admin.from("agencies").update({ is_internal: false }).eq("id", frank.agencyId);
    await pa.cleanup();
  }
});

test("on a phone the admin menu is behind a button and the page is full width", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize(PHONE_VIEWPORT);
  const pa = await makePlatformAdmin();
  try {
    await signIn(page, pa.email);
    const nav = page.getByRole("navigation", { name: "Admin sections" });
    await expect(nav).toHaveCount(0);
    const main = await page.locator(".setmain").boundingBox();
    expect(main!.width).toBeGreaterThan(PHONE_VIEWPORT.width - 2);
    await page.getByRole("button", { name: "Menu" }).click();
    await nav.getByRole("link", { name: "Workspaces" }).click();
    await page.waitForURL(`${ADMIN}/admin/agencies`);
    // Choosing a page closes it.
    await expect(nav).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Workspaces" })).toBeVisible();
    // Nothing wider than the screen but the table, which scrolls in itself.
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(pageWidth).toBeLessThanOrEqual(PHONE_VIEWPORT.width);
  } finally {
    await pa.cleanup();
  }
});
