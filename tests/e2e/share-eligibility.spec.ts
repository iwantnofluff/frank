import { test, expect } from "./fixtures";

// Two gates on sharing a post still in Concept or Internal Review, both
// direct instruction: the toolbar button itself only opens Share For
// Review from a Client Review creative, and — since a project's other
// posts can still be below Client Review even when the one you're
// viewing isn't — "Multiple Posts" greys those out individually rather
// than letting them be picked and only warning about it afterward.
// resolveShareEligibility (lib/shared-link-eligibility.ts) still backs a
// defensive warning for the one edge case that can still reach it: a
// piece's stage regressing after it's already selected, while the modal
// stays open.

test("Share for review is disabled outside Client Review, and enabled once there", async ({ page, frank }) => {
  const internalCreativeId = await frank.createCreativeAtStage(1);
  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${internalCreativeId}`);

  const shareButton = page.locator('button[title="Only available in Client Review"]');
  await expect(shareButton).toBeDisabled();

  await page.goto(`/creatives/${frank.creativeId}`); // fixture's own creative is stage 3
  await expect(page.locator('button[title="Share for review"]')).toBeEnabled();
});

test("ShareModal's Multiple Posts grid greys out posts still below Client Review", async ({ page, frank }) => {
  await frank.createCreativeAtStage(1);
  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${frank.creativeId}`); // fixture's own creative is stage 3, eligible
  await page.click('button[title="Share for review"]');
  await page.click('button[role="radio"]:has-text("Multiple Posts")');

  const internalTile = page.locator(`.pktile[title="Move this post to Client Review to share it"]`);
  await expect(internalTile).toHaveClass(/ineligible/);
  await expect(internalTile).toBeDisabled();

  // The eligible piece (the one being viewed, auto-picked by
  // toggleScope) is selectable — confirms only the ineligible one is
  // locked, not every tile the way scope "one" leaves them.
  const eligibleTile = page.locator(".pktile.selected");
  await expect(eligibleTile).not.toHaveClass(/locked|ineligible/);
  // Genuinely not just visually dimmed — clicking it doesn't select it.
  await internalTile.click({ force: true }).catch(() => {});
  await expect(internalTile).not.toHaveClass(/selected/);

  // The eligible piece already picked by default (the one being viewed)
  // creates cleanly, with nothing to warn about.
  await expect(page.locator(".note.warn")).toHaveCount(0);
  await page.click('button:has-text("Create link")');
  await expect(page.locator(".linkrow code")).toBeVisible();
});
