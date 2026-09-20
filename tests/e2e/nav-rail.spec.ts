import { test, expect } from "./fixtures";

// Regression coverage for the rail dead-end fix (docs/parity-gaps.md,
// "Primary nav — three icons led to a dead 404 — RESOLVED"). Calendar/
// Analytics/Visibility have no route yet, so this asserts reachability
// (rendered or not), not screenshots of screens that don't exist.

test("Calendar/Analytics/Visibility are absent outside a client context", async ({
  page,
  frank,
}) => {
  await frank.loginAsStaff(page);
  await page.goto("/dashboard");
  await page.waitForSelector(".clients, .empty");

  await expect(page.locator('a[href="/calendar"]')).toHaveCount(0);
  await expect(page.locator('a[href="/analytics"]')).toHaveCount(0);
  await expect(page.locator('a[href="/visibility"]')).toHaveCount(0);
});

test("Calendar/Analytics/Visibility are present inside a client context", async ({
  page,
  frank,
}) => {
  await frank.loginAsStaff(page);
  await page.goto(`/clients/${frank.clientId}`);
  await page.waitForSelector(".clients, .empty");

  await expect(page.locator('a[href="/calendar"]')).toHaveCount(1);
  await expect(page.locator('a[href="/analytics"]')).toHaveCount(1);
  await expect(page.locator('a[href="/visibility"]')).toHaveCount(1);
});
