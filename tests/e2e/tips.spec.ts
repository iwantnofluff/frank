import { createClient } from "@supabase/supabase-js";
import { test, expect } from "./fixtures";

// Tips (phase116, direct instruction): a card top right for the team, as
// often as each person sets; See it in Action goes to the feature and
// lights it up, Read More opens its Help article.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const staffId = async (email: string) => (await admin.from("users").select("id").eq("email", email).single()).data!.id as string;

test("a tip shows once due, is recorded as seen, and Read More opens its article", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const id = await staffId(frank.staffEmail);
  await admin.from("users").update({ tips_every_hours: 24, tips_seen: [], tips_last_at: null }).eq("id", id);
  await frank.loginAsStaff(page);

  const card = page.locator(".tipcard.is-open");
  await expect(card).toContainText("Design with Frank", { timeout: 15_000 });
  await expect
    .poll(async () => (await admin.from("users").select("tips_seen, tips_last_at").eq("id", id).single()).data, { timeout: 10_000 })
    .toMatchObject({ tips_seen: ["design-with-frank"] });

  await card.getByRole("button", { name: "Read More" }).click();
  await expect(page.locator(".helppanel h2, .helppanel h1").first()).toContainText("Design with Frank", { timeout: 10_000 });

  // Shown today already: a reload brings no other.
  await page.reload();
  await page.waitForTimeout(2500);
  await expect(page.locator(".tipcard")).toHaveCount(0);
});

test("See it in Action opens a new post and lights up Design with Frank", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const id = await staffId(frank.staffEmail);
  await admin.from("users").update({ tips_every_hours: 24, tips_seen: [], tips_last_at: null }).eq("id", id);
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.locator(".tipcard.is-open").getByRole("button", { name: "See it in Action" }).click({ timeout: 15_000 });
  await expect(page.locator('[data-tip="design-with-frank"].tip-spot')).toBeVisible({ timeout: 15_000 });
});

test("off in My Profile: no tip, and the setting saves", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const id = await staffId(frank.staffEmail);
  await admin.from("users").update({ tips_every_hours: 24, tips_seen: ["design-with-frank"], tips_last_at: new Date().toISOString() }).eq("id", id);
  await frank.loginAsStaff(page);
  await page.goto("/profile/notifications");
  const pick = page.getByLabel("Show tips");
  await expect(pick).toHaveValue("24", { timeout: 15_000 });
  await pick.selectOption("0");
  await expect(page.locator("#notifications .sync")).toHaveText("Saved");
  expect((await admin.from("users").select("tips_every_hours").eq("id", id).single()).data!.tips_every_hours).toBe(0);
});

test("a client gets no tips and no tips setting", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await frank.loginAsClient(page);
  await page.goto("/profile/notifications");
  await expect(page).toHaveURL(/\/profile$/, { timeout: 15_000 });
  await expect(page.getByRole("link", { name: "Notifications" })).toHaveCount(0);
  await expect(page.locator(".tipcard")).toHaveCount(0);
});
