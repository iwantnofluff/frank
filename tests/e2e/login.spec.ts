import { test, expect } from "@playwright/test";

// No fixture needed — /login renders the same regardless of what's in the
// database. Run with the dev server already up on :3000.

test("login page", async ({ page }) => {
  await page.goto("/login");
  await page.waitForSelector(".fd-card");
  await expect(page).toHaveScreenshot("login.png");
});
