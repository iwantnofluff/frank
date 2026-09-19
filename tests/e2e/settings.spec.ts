import { test, expect } from "./fixtures";

test("settings — knowledge tab (default landing)", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto("/settings");
  await page.waitForURL(/\/settings\/knowledge/);
  // .settingsnav is the layout shell and renders instantly regardless of
  // data state — wait for the actual page content (useMyAgency +
  // useFormatDirections) via the always-present "+ Add format" control.
  await page.waitForSelector('button:has-text("Add format")');
  await expect(page).toHaveScreenshot("settings-knowledge.png");
});
