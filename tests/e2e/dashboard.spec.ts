import { test, expect } from "./fixtures";

test("dashboard — clients list", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto("/dashboard");
  await page.waitForSelector(".pad .h1");
  await expect(page).toHaveScreenshot("dashboard.png");
});
