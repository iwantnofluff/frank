import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";
import { CURRENT_RELEASE, RELEASES } from "../../lib/releases";
import { displayVersion } from "../../lib/release-version";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
// Frank's updates (direct instruction): the newest in the team's bell,
// opening the Updates page at it and reading it everywhere; earlier ones
// open from their links; a newer version live offers to reload; Clients
// get no notice.
test("a new version is in the team's bell, opens Updates, and a newer one offers to reload", async ({ page, browser, frank }) => {
  test.setTimeout(120_000);
  // Seen none yet (the fixture marks today's as seen for every other test).
  await admin.from("users").update({ releases_seen: null }).eq("email", frank.staffEmail);
  await frank.loginAsStaff(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(APP_URL + "/dashboard");
  await page.getByRole("button", { name: "Notifications" }).click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await expect(panel).toContainText(`Frank ${displayVersion(CURRENT_RELEASE.version)} is here`, { timeout: 20_000 });
  await expect(panel.locator(".nrow", { hasText: "is here" })).toHaveCount(1);
  await panel.locator(".nrow", { hasText: "is here" }).click();
  await page.waitForURL(`**/settings/general/updates#v${CURRENT_RELEASE.version.replace(/\./g, "-")}`);
  await expect(page.getByRole("heading", { name: "Updates" })).toBeVisible();
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  await expect.poll(async () => (await admin.from("users").select("releases_seen").eq("id", staffId).single()).data!.releases_seen).toBe(CURRENT_RELEASE.version);
  const earlier = RELEASES[1];
  await page.locator(".rel-link", { hasText: earlier.title }).click();
  await expect(page.locator(".rel-row", { hasText: earlier.title })).toContainText(earlier.changes[0]);
  // Bell clear now.
  await page.goto(APP_URL + "/dashboard");
  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(page.getByRole("dialog", { name: "Notifications" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Notifications" }).locator(".nrow", { hasText: "is here" })).toHaveCount(0);
  // A newer version live: the reload bar.
  const next = CURRENT_RELEASE.version.replace(/^(\d+)\.(\d+)\..*$/, (_, a, b) => `${a}.${Number(b) + 1}.0`);
  await page.route("**/api/version", (r) => r.fulfill({ json: { version: next } }));
  await page.goto(APP_URL + "/dashboard");
  await expect(page.locator(".updready")).toContainText(`Frank ${displayVersion(next)} is ready`, { timeout: 20_000 });
  // A Client: no notice.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const c = await ctx.newPage();
  await frank.loginAsClient(c);
  await c.goto(APP_URL + "/dashboard");
  await c.getByRole("button", { name: "Notifications" }).click();
  await expect(c.getByRole("dialog", { name: "Notifications" })).toBeVisible();
  await c.waitForTimeout(1500);
  await expect(c.getByRole("dialog", { name: "Notifications" }).locator(".nrow", { hasText: "is here" })).toHaveCount(0);
  await ctx.close();
});
