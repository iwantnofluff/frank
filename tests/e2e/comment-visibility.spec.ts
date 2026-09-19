import { test, expect } from "./fixtures";

// Regression coverage for the internal/public comment states: the
// .cmt.internal border, and the .intog composer toggle's icon polarity
// (checked/internal shows a lock, unchecked/public shows nothing) — both
// landed in the same pass as the .scrim rename and are otherwise untested.
// Seeded through a real authenticated staff session, per frank-conventions
// — the service-role client has no auth.uid(), and
// comments_enforce_visibility() (supabase/seed.sql) would silently coerce
// a service-role-inserted "private" comment to public before this test
// ever saw it. See docs/comment-visibility-verification.md.

test("comment cards — internal vs public", async ({ page, frank }) => {
  await frank.insertCommentAsStaff("An internal-only note.", "private");
  await frank.insertCommentAsStaff("A public note.", "public");

  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${frank.creativeId}`);
  await page.waitForSelector(".cmts-b .cmt");

  await expect(page.locator(".cmts")).toHaveScreenshot("comment-cards.png");
});

test("composer toggle — internal (checked) and public (unchecked)", async ({
  page,
  frank,
}) => {
  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${frank.creativeId}`);
  await page.waitForSelector(".intog");

  // Default is checked (internal) — see CommentsPanel.tsx's useState(true).
  await expect(page.locator(".intog")).toHaveScreenshot("intog-checked-internal.png");

  await page.click(".intog input");
  await expect(page.locator(".intog")).toHaveScreenshot("intog-unchecked-public.png");
});
