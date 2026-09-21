import { test, expect } from "./fixtures";

test("project table", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  // Same trap as client-workspace: .pad .h1 renders with fallback text
  // before useProject/useCreatives resolve. Wait for the actual table or
  // its empty state.
  await page.waitForSelector(".ptable, .empty");
  // useIsStaff (useMyAgency + useMyMembership) resolves on its own,
  // independent of useProject/useCreatives — the New Brief button and the
  // Settings nav item both fail closed (hidden) until it does. Without
  // this wait the screenshot races ahead and can land on that hidden
  // state under worker concurrency, same shape as the dashboard's stat
  // cards needing their own explicit wait.
  await page.waitForSelector('button:has-text("New Brief")');
  await expect(page).toHaveScreenshot("project-table.png");
});
