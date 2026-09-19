import { test, expect } from "./fixtures";

// No session at all — a real share-link visitor. Exercises .phonewrap/
// .browser/.phone/.dk-* (the public review page, entirely separate CSS
// from the authenticated app shell).

test("shared review — public, no session", async ({ page, frank }) => {
  const token = await frank.createSharedLink();
  await page.goto(`/review/${token}`);
  await page.waitForSelector(".phonewrap");
  await expect(page).toHaveScreenshot("shared-review-public.png");
});
