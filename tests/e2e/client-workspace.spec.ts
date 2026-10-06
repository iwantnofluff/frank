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
  await expect(page.locator(".crow:not(.head) .stagecount").first()).not.toHaveText("…");
  // useIsStaff (the agency mark's Settings menu, .markbtn) resolves independently
  // and fails closed (hidden) until it does — wait for it too, or this
  // screenshot can race ahead under worker concurrency and land on a
  // rail missing Settings.
  await page.waitForSelector(".markbtn");
  await expect(page).toHaveScreenshot("client-workspace.png");
});

test("client workspace — project row creative stats", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/clients/${frank.clientId}`);
  await page.waitForSelector(".clients, .empty");
  const row = page.locator(".crow:not(.head)").first();
  // Fixture seeds exactly one project and one stage-3 (review-band)
  // creative on it: waiting on the client's own approval.
  await expect(row.locator(".kbadge.sch")).toHaveText("Content Planner");
  const stageCounts = row.locator(".stagecount");
  await expect(stageCounts.nth(0)).toHaveText("0"); // Concept
  await expect(stageCounts.nth(1)).toHaveText("0"); // Internal Review
  await expect(stageCounts.nth(2)).toHaveText("1"); // Client Review
});
