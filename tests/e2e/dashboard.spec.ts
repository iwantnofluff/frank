import { test, expect } from "./fixtures";

test("dashboard — clients list", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto("/dashboard");
  // .pad .h1 is static; wait for the actual client list/empty state so this
  // can't race ahead of useClients() the way client-workspace/project-table/
  // settings-knowledge did.
  await page.waitForSelector(".clients, .empty");
  // useAgencyCreativeStats resolves separately from useClients and starts
  // out showing "…" — wait for it to settle too, or this screenshot can
  // land on the pending placeholder instead of real numbers depending on
  // which query happens to finish first.
  await expect(page.locator(".stats .stat .n").nth(1)).not.toHaveText("…");
  // useIsStaff (NavRail's Settings link, #navSet) resolves independently
  // of both queries above and fails closed (hidden) until it does — wait
  // for it too, or this screenshot can race ahead under worker
  // concurrency and land on a rail missing Settings.
  await page.waitForSelector("#navSet");
  await expect(page).toHaveScreenshot("dashboard.png");
});

test("dashboard — creative-stats cards", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto("/dashboard");
  await page.waitForSelector(".clients, .empty");
  // useAgencyCreativeStats resolves on its own query, separate from
  // useClients — wait for its cards to leave the "…" pending placeholder so
  // this can't race ahead and assert against a state that was never meant
  // to be final.
  const statNumbers = page.locator(".stats .stat .n");
  await expect(statNumbers.nth(1)).not.toHaveText("…");
  // Fixture seeds exactly one project and one stage-3 (review-band)
  // creative, so: 1 live project, 1 waiting on approval, 0 needing action.
  await expect(statNumbers.nth(0)).toHaveText("1"); // Active Clients
  await expect(statNumbers.nth(1)).toHaveText("1"); // Live Projects
  await expect(statNumbers.nth(2)).toHaveText("1"); // Waiting on Approval
  await expect(statNumbers.nth(3)).toHaveText("0"); // Feedback to Action
});
