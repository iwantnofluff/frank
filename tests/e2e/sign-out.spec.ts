import { test, expect, APP_URL } from "./fixtures";

test("the account menu shows who you are and signs you out for real", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.getByRole("button", { name: "Your account" }).click();
  const menu = page.getByRole("menu", { name: "Your account" });
  await expect(menu).toContainText("E2E Staff");
  await expect(menu).toContainText(frank.staffEmail);

  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  await page.getByRole("button", { name: "Your account" }).click();
  await menu.getByRole("menuitem", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/, { timeout: 15000 });

  // Signed out, not just moved: the app sends you back to sign in.
  await page.goto(`${APP_URL}/dashboard`);
  await page.waitForURL(/\/login/, { timeout: 15000 });
});
