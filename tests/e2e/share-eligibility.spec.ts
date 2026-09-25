import { test, expect } from "./fixtures";

// ShareModal used to create a link silently, with no indication that
// shared_link_allowed_creative_ids' stage >= 3 rule would exclude
// everything it covers — the exact failure mode behind the "creatives
// uploaded via the live site don't display" report (docs/parity-gaps.md).
// This previews eligibility before the link exists, without blocking
// creation.

test("ShareModal warns when a scope resolves to zero eligible creatives", async ({ page, frank }) => {
  const internalCreativeId = await frank.createCreativeAtStage(1);
  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${internalCreativeId}`);
  await page.click('button[title="Share for review"]');
  await page.click('button[role="radio"]:has-text("Current Post")');

  const note = page.locator(".note.warn");
  await expect(note).toContainText("This link will show nothing yet");
  await expect(note).toContainText("Concept or Internal Review");

  // Not blocked — creating the link is still allowed.
  await expect(page.locator('button:has-text("Create link")')).toBeEnabled();
});

test("ShareModal reports a partial exclusion without blocking link creation", async ({ page, frank }) => {
  await frank.createCreativeAtStage(1);
  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${frank.creativeId}`); // fixture's own creative is stage 3, eligible
  await page.click('button[title="Share for review"]');
  await page.click('button[role="radio"]:has-text("Multiple Posts")');
  // "Multiple Posts" starts with the current piece already ticked (see
  // ShareModal's own toggleScope) — click the rest of the grid so this
  // covers the whole project, same as the old "The whole project" scope.
  // Tiles only become clickable once React re-renders with scope "pick"
  // (they carry no `disabled` attribute while locked, just no onClick),
  // so wait for that before clicking or the click silently no-ops.
  const tiles = page.locator(".pktile");
  await expect(tiles.first()).not.toHaveClass(/locked/);
  const tileCount = await tiles.count();
  for (let i = 0; i < tileCount; i++) {
    const isSelected = await tiles.nth(i).evaluate((el) => el.classList.contains("selected"));
    if (!isSelected) await tiles.nth(i).click();
  }

  const note = page.locator(".note").filter({ hasNotText: "Anyone with the link" });
  await expect(note).toContainText("1 of 2 won't show on this link");
  await expect(note).not.toHaveClass(/warn/);

  await page.click('button:has-text("Create link")');
  await expect(page.locator(".linkrow code")).toBeVisible();
});
