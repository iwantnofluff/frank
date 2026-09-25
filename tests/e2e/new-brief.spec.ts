import { test, expect } from "./fixtures";

// This is the first code path in the app that creates a creatives row —
// verified empirically against real staff/client sessions before the form
// was built (docs/parity-gaps.md, "New Brief"). These specs exercise the
// actual form on top of that verified basis.

test("creates a scheduled creative end to end", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".ptable, .empty");

  await page.click('button:has-text("New Brief")');
  await page.fill("#nbName", "New Brief E2E — Scheduled");
  await page.fill("#nbDate", "2027-04-01");
  await page.click('button:has-text("Create Brief")');

  // CreativeModal stays open on success rather than closing — creating the
  // brief unlocks the Content tab in the same window (the merge that
  // replaced New Brief / Upload or Edit / Draft from Brief as three
  // separate entry points), so there's something to switch to.
  await expect(page.getByRole("tab", { name: "Content" })).toBeEnabled();
  await page.click('button:has-text("Cancel")');
  await expect(page.locator(".scrim")).toHaveCount(0);
  await expect(page.locator(".pname", { hasText: "New Brief E2E — Scheduled" })).toBeVisible();
});

test("creates a continuous creative end to end", async ({ page, frank }) => {
  const continuousProjectId = await frank.createContinuousProject();
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${continuousProjectId}`);
  await page.waitForSelector(".ptable, .empty");

  await page.click('button:has-text("New Brief")');
  await page.fill("#nbName", "New Brief E2E — Continuous");
  await page.fill("#nbDest", "https://example.com/listing");
  await page.click('button:has-text("Create Brief")');

  await expect(page.getByRole("tab", { name: "Content" })).toBeEnabled();
  await page.click('button:has-text("Cancel")');
  await expect(page.locator(".scrim")).toHaveCount(0);
  await expect(page.locator(".pname", { hasText: "New Brief E2E — Continuous" })).toBeVisible();
});

test("missing publish date is caught before submit, not by the DB trigger", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".ptable, .empty");

  await page.click('button:has-text("New Brief")');
  await page.fill("#nbName", "Should Not Be Created");
  await page.click('button:has-text("Create Brief")');

  // Field-level error, modal still open — the scheduled_at trigger never
  // gets a chance to be the thing the user meets.
  await expect(page.locator(".autherr", { hasText: "Pick a publish date" })).toBeVisible();
  await expect(page.locator(".scrim")).toHaveCount(1);
  await expect(page.locator(".pname", { hasText: "Should Not Be Created" })).toHaveCount(0);
});

test("a real client-role session has no New Brief entry point", async ({ page, frank }) => {
  await frank.loginAsClient(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".ptable, .empty");

  await expect(page.locator('button:has-text("New Brief")')).toHaveCount(0);
});
