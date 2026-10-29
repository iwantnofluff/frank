import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";

// A project on a phone (direct instruction): its posts as cards, a month at
// a time, with Copy Caption, Final Asset for the team, and Approve Concept
// while one waits.
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const CAPTION = "Nobody misses on purpose.\n\nThey skip the part where you work out what you're aiming at.";
const LINK = "https://drive.google.com/drive/folders/e2e-mobile-project";

// This month, so the cards open on it.
const thisMonth = (day: number) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), day, 10).toISOString();
};

test("on a phone the team sees the month's posts as cards: copy, Final Asset, approve, open", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await admin.from("creatives").update({ scheduled_at: thisMonth(2) }).eq("id", frank.creativeId);
  await frank.createCopyVersion(frank.creativeId, 1, { caption: CAPTION });
  await admin.from("creative_asset_links").insert({ creative_id: frank.creativeId, url: LINK });
  const concept = await frank.createCreativeAtStage(1, "Concept Waiting");
  await admin.from("creatives").update({ concept: "Rain on the window", scheduled_at: thisMonth(3) }).eq("id", concept);

  await frank.loginAsStaff(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  const cards = page.locator(".mproj-card");
  await expect(cards).toHaveCount(2, { timeout: 20_000 });
  // No table, and in date order.
  await expect(page.locator(".tbl")).toHaveCount(0);
  await expect(cards.first()).toContainText("E2E Test Creative");
  await expect(cards.nth(1)).toContainText("Concept Waiting");

  const first = cards.first();
  await first.getByRole("button", { name: "Copy Caption" }).click();
  await expect(first.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(CAPTION);
  await expect(first.getByRole("link", { name: "Final Asset" })).toHaveAttribute("href", LINK);
  await expect(cards.nth(1).getByRole("link", { name: "Final Asset" })).toHaveCount(0);

  // Approve Concept moves it on.
  await cards.nth(1).getByRole("button", { name: "Approve Concept" }).click();
  await expect.poll(async () => (await admin.from("creatives").select("stage").eq("id", concept).single()).data!.stage).toBe(2);

  // Another month: none there.
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(cards).toHaveCount(0);
  await expect(page.getByText(/^No posts in /)).toBeVisible();
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(cards).toHaveCount(2);

  // A platform with none of them.
  await page.getByLabel("Platform").selectOption("linkedin");
  await expect(cards).toHaveCount(0);
  await page.getByLabel("Platform").selectOption("all");

  // The name opens the post.
  await first.getByRole("link", { name: "E2E Test Creative" }).click();
  await page.waitForURL(`**/creatives/${frank.creativeId}`);
  await expect(page.locator(".mpost")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("on a phone a client's cards have Copy Caption and no Final Asset", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await admin.from("creatives").update({ scheduled_at: thisMonth(2) }).eq("id", frank.creativeId);
  await frank.createCopyVersion(frank.creativeId, 1, { caption: CAPTION });
  await admin.from("creative_asset_links").insert({ creative_id: frank.creativeId, url: LINK });

  await frank.loginAsClient(page);
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  const card = page.locator(".mproj-card", { hasText: "E2E Test Creative" });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card.getByRole("button", { name: "Copy Caption" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Final Asset" })).toHaveCount(0);
});

test("on a phone an Other Content project's cards go by their due date", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const projectId = await frank.createContinuousProject();
  const dueOn = thisMonth(5).slice(0, 10);
  await frank.createContinuousCreative(projectId, { name: "Due This Month", stage: 2, dueOn });
  await frank.createContinuousCreative(projectId, { name: "No Due Date", stage: 2 });

  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/projects/${projectId}`);
  const cards = page.locator(".mproj-card");
  await expect(cards).toHaveCount(1, { timeout: 20_000 });
  await expect(cards.first()).toContainText("Due This Month");
});
