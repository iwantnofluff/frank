import { test, expect } from "./fixtures";

// Regression coverage for CommentCard's Resolve/Reopen gate: verified
// empirically against real authenticated sessions that comments_update_own
// (supabase/seed.sql) allows author_id = auth.uid() OR is_agency_staff —
// authorship, not role — so a client resolving their own thread succeeds
// at the database layer even though they aren't staff. The UI condition
// is isStaff || thread.author_id === currentUserId, matching that exactly
// (and matching the prototype, which only gates Make Public/Private
// behind MODE==="client", not Resolve/Reopen).

test("a client can resolve and reopen a thread they authored", async ({ page, frank }) => {
  await frank.loginAsClient(page);
  await page.goto(`/creatives/${frank.creativeId}`);
  await page.waitForSelector(".composer textarea");

  await page.fill(".composer textarea", "Client's own thread for the resolve test");
  await page.click(".composer button:has-text('Post')");

  const card = page.locator(".cmt", { hasText: "Client's own thread for the resolve test" });
  await expect(card).toBeVisible();
  await expect(card).not.toHaveClass(/resolved/);

  await card.locator("button:has-text('Resolve')").click();
  await expect(card).toHaveClass(/resolved/);

  await card.locator("button:has-text('Reopen')").click();
  await expect(card).not.toHaveClass(/resolved/);
});

test("a client cannot resolve a thread someone else authored", async ({ page, frank }) => {
  await frank.insertCommentAsStaff("Staff's own thread, not the client's", "public");

  await frank.loginAsClient(page);
  await page.goto(`/creatives/${frank.creativeId}`);

  const card = page.locator(".cmt", { hasText: "Staff's own thread, not the client's" });
  await expect(card).toBeVisible();
  await expect(card.locator("button:has-text('Resolve')")).toHaveCount(0);
  await expect(card.locator("button:has-text('Reopen')")).toHaveCount(0);
});
