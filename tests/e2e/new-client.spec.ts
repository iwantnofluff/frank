import { test, expect } from "./fixtures";

test("creates a client end to end", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto("/dashboard");
  await page.waitForSelector(".clients, .empty");

  await page.click('button:has-text("New Client")');
  await page.fill("#ncName", "New Client E2E — Lotus Skincare");
  await page.fill("#ncInd", "D2C beauty");
  await page.click('button:has-text("Create Client")');

  await expect(page.locator(".scrim")).toHaveCount(0);
  await expect(
    page.locator(".crow", { hasText: "New Client E2E — Lotus Skincare" }),
  ).toBeVisible();
});

test("missing name is caught before submit", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto("/dashboard");
  await page.waitForSelector(".clients, .empty");

  await page.click('button:has-text("New Client")');
  await page.click('button:has-text("Create Client")');

  await expect(page.locator(".autherr", { hasText: "Give the client a name" })).toBeVisible();
  await expect(page.locator(".scrim")).toHaveCount(1);
});

test("a real client-role session has no New Client entry point", async ({ page, frank }) => {
  await frank.loginAsClient(page);
  await page.goto("/dashboard");
  await page.waitForSelector(".clients, .empty");

  await expect(page.locator('button:has-text("New Client")')).toHaveCount(0);
});
