import { test, expect } from "./fixtures";

// No session at all — a real share-link visitor. Exercises .phonewrap/
// .browser/.phone/.dk-* (the public review page, entirely separate CSS
// from the authenticated app shell).

test("shared review — public, no session", async ({ page, frank }) => {
  const token = await frank.createSharedLink();
  await page.goto(`/review/${token}`);
  // .phonewrap renders for the loading state too ("Loading…", nothing
  // else) — wait for the desktop list, which only exists once
  // get_shared_review() has actually resolved. (.m-top is MobileReview's
  // equivalent, but it's display:none at this viewport width, so waiting
  // for it — visible by default — would hang.)
  await page.waitForSelector(".dk-list");
  // .br-url renders the live page URL, which contains this test's randomly
  // generated token — genuinely different every run by design, not a
  // rendering difference. Masked rather than faked with a fixed token,
  // since a fixed token risks a unique-constraint collision if this spec
  // ever runs concurrently with itself.
  await expect(page).toHaveScreenshot("shared-review-public.png", {
    mask: [page.locator(".br-url")],
  });
});
