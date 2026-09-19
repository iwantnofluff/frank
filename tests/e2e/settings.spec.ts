import { test, expect } from "./fixtures";

test("settings — knowledge tab (default landing)", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto("/settings");
  await page.waitForURL(/\/settings\/knowledge/);
  await page.waitForSelector(".settingsnav");
  await expect(page).toHaveScreenshot("settings-knowledge.png");
});
