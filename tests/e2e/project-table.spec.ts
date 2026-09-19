import { test, expect } from "./fixtures";

test("project table", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".pad .h1");
  await expect(page).toHaveScreenshot("project-table.png");
});
