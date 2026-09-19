import { test, expect } from "./fixtures";

test("client workspace", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/clients/${frank.clientId}`);
  await page.waitForSelector(".pad .h1");
  await expect(page).toHaveScreenshot("client-workspace.png");
});
