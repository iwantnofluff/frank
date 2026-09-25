import { test, expect } from "./fixtures";

test("client workspace", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/clients/${frank.clientId}`);
  // .pad .h1 renders immediately with fallback text before useClientDetail/
  // useProjects resolve — wait for the actual data-dependent content
  // (the project list or its empty state) instead, or the screenshot races
  // ahead of the real page.
  await page.waitForSelector(".clients, .empty");
  // useProjectCreativeStats resolves on its own query, separate from
  // useProjects — wait for it to settle so the screenshot can't land on the
  // "…" pending placeholder instead of real numbers.
  await expect(page.locator(".crow:not(.head) .barlbl").first()).not.toHaveText("…");
  // useIsStaff (NavRail's Settings link, #navSet) resolves independently
  // and fails closed (hidden) until it does — wait for it too, or this
  // screenshot can race ahead under worker concurrency and land on a
  // rail missing Settings.
  await page.waitForSelector("#navSet");
  await expect(page).toHaveScreenshot("client-workspace.png");
});

test("client workspace — project row creative stats", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/clients/${frank.clientId}`);
  await page.waitForSelector(".clients, .empty");
  const row = page.locator(".crow:not(.head)").first();
  // Fixture seeds exactly one project and one stage-3 (review-band)
  // creative on it: 1 total, 0 approved, 1 waiting — "with the client" in
  // the default (non-client-preview) mode, matching the prototype's
  // projStats()-driven status tag.
  await expect(row.locator(".kbadge.sch")).toHaveText("Scheduled");
  await expect(row).toContainText("1 total");
  await expect(row.locator(".barlbl")).toHaveText("0 of 1 approved");
  await expect(row.locator(".tag.amber")).toHaveText("1 with the client");
});
