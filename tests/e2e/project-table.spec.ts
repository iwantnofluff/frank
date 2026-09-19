import { test, expect } from "./fixtures";

test("project table", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  // Same trap as client-workspace: .pad .h1 renders with fallback text
  // before useProject/useCreatives resolve. Wait for the actual table or
  // its empty state.
  await page.waitForSelector(".ptable, .empty");
  await expect(page).toHaveScreenshot("project-table.png");
});
