import { test, expect } from "./fixtures";

test("client workspace", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/clients/${frank.clientId}`);
  // .pad .h1 renders immediately with fallback text before useClientDetail/
  // useProjects resolve — wait for the actual data-dependent content
  // (the project list or its empty state) instead, or the screenshot races
  // ahead of the real page.
  await page.waitForSelector(".clients, .empty");
  await expect(page).toHaveScreenshot("client-workspace.png");
});
