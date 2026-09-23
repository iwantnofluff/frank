import { test, expect } from "./fixtures";

test("creates a scheduled project end to end and lands on its page", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/clients/${frank.clientId}`);
  await page.waitForSelector(".clients, .empty");

  await page.click('button:has-text("New Project")');
  await page.fill("#newName", "New Project E2E — Scheduled");
  await page.click('button:has-text("Create")');

  await page.waitForURL(/\/projects\/.+/);
  await expect(page.locator(".h1", { hasText: "New Project E2E — Scheduled" })).toBeVisible();
});

test("creates a continuous project with its type", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/clients/${frank.clientId}`);
  await page.waitForSelector(".clients, .empty");

  await page.click('button:has-text("New Project")');
  await page.click('.kopt:has-text("Continuous")');
  await expect(page.locator("#newType")).toHaveValue("Amazon");
  await page.fill("#newName", "New Project E2E — Continuous");
  await page.click('button:has-text("Create")');

  await page.waitForURL(/\/projects\/.+/);
  await expect(page.locator(".h1", { hasText: "New Project E2E — Continuous" })).toBeVisible();
});

test("missing name is caught before submit", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/clients/${frank.clientId}`);
  await page.waitForSelector(".clients, .empty");

  await page.click('button:has-text("New Project")');
  await page.click('button:has-text("Create")');

  await expect(page.locator(".autherr", { hasText: "Give it a name first" })).toBeVisible();
  await expect(page.locator(".scrim")).toHaveCount(1);
});

test("a real client-role session has no New Project entry point", async ({ page, frank }) => {
  await frank.loginAsClient(page);
  await page.goto(`/clients/${frank.clientId}`);
  await page.waitForSelector(".clients, .empty");

  await expect(page.locator('button:has-text("New Project")')).toHaveCount(0);
});
