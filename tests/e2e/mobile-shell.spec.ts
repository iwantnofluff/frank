import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";

// Frank's frame on a phone (direct instruction): no rail, its links under
// the menu button; no search or breadcrumb; the lists one column; and the
// pages made for a computer saying so.
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

test("on a phone the rail's links open from the menu, and computer pages say so", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  await expect(page.locator(".mproj")).toBeVisible({ timeout: 20_000 });
  const rail = page.locator(".rail");
  await expect(rail).toBeHidden();
  await expect(page.locator(".topbar .crumb")).toBeHidden();
  await expect(page.locator(".topbar .gsearch")).toBeHidden();

  // The menu: the rail's links, closing on the next page.
  const menu = page.getByRole("button", { name: "Menu" });
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(rail).toBeVisible();
  await expect(rail.getByRole("link", { name: "Clients" })).toBeVisible();
  await rail.getByRole("link", { name: /Projects$/ }).click();
  await page.waitForURL(/\/clients\/[^/]+$/);
  await expect(rail).toBeHidden();
  // A tap elsewhere closes it too.
  await menu.click();
  await expect(rail).toBeVisible();
  await page.locator(".view").click({ position: { x: 200, y: 600 } });
  await expect(rail).toBeHidden();

  // A client's projects: a row each, its name alone; no adding on a phone.
  const row = page.locator(".clients .crow", { hasText: "E2E Test Project" });
  await expect(row).toBeVisible();
  await expect(row.locator(".ago").first()).toBeHidden();
  await expect(page.getByRole("button", { name: "New Project" })).toBeHidden();
  await row.click();
  await page.waitForURL(`**/projects/${frank.projectId}`);

  // Made for a computer.
  for (const path of ["/settings", "/profile", "/analytics"]) {
    await page.goto(`${APP_URL}${path}`);
    await expect(page.getByText("Open this on a computer")).toBeVisible({ timeout: 15_000 });
  }
  await page.getByRole("link", { name: "Go to Clients" }).click();
  await page.waitForURL("**/dashboard");
  await expect(page.locator(".clients .crow", { hasText: "E2E Test Client" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("on a computer there's no menu button, and the rail and Settings are as they were", async ({ page, frank }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await admin.from("creatives").update({ scheduled_at: new Date().toISOString() }).eq("id", frank.creativeId);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  await expect(page.locator(".tbl")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Menu" })).toBeHidden();
  await expect(page.locator(".rail")).toBeVisible();
  await expect(page.locator(".mproj")).toHaveCount(0);
  await page.goto(`${APP_URL}/settings`);
  await expect(page.getByText("Open this on a computer")).toHaveCount(0);
});
