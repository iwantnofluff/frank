import { test, expect } from "./fixtures";

// ShareModal used to create a link silently, with no indication that
// shared_link_allowed_creative_ids' stage >= 5 rule would exclude
// everything it covers — the exact failure mode behind the "creatives
// uploaded via the live site don't display" report (docs/parity-gaps.md).
// This previews eligibility before the link exists, without blocking
// creation.

test("ShareModal warns when a scope resolves to zero eligible creatives", async ({ page, frank }) => {
  const internalCreativeId = await frank.createCreativeAtStage(1);
  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${internalCreativeId}`);
  await page.click('button[title="Share for review"]');
  await page.click('button[role="radio"]:has-text("Just this one")');

  const note = page.locator(".note.warn");
  await expect(note).toContainText("This link will show nothing yet");
  await expect(note).toContainText("Concept, Copy, Design or Internal QC");

  // Not blocked — creating the link is still allowed.
  await expect(page.locator('button:has-text("Create link")')).toBeEnabled();
});

test("ShareModal reports a partial exclusion without blocking link creation", async ({ page, frank }) => {
  await frank.createCreativeAtStage(1);
  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${frank.creativeId}`); // fixture's own creative is stage 5, eligible
  await page.click('button[title="Share for review"]');
  await page.click('button[role="radio"]:has-text("The whole project")');

  const note = page.locator(".note").filter({ hasNotText: "Anyone with the link" });
  await expect(note).toContainText("1 of 2 won't show on this link");
  await expect(note).not.toHaveClass(/warn/);

  await page.click('button:has-text("Create link")');
  await expect(page.locator(".linkrow code")).toBeVisible();
});
