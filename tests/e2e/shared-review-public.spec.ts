import { test, expect } from "./fixtures";

// No session at all — a real share-link visitor. Exercises .phonewrap/
// .browser/.phone/.dk-*/.pw-side/.pw-seg (the public review page, entirely
// separate CSS from the authenticated app shell).
//
// Which shape shows is now a manual .pw-seg toggle, not a media query
// (docs/parity-gaps.md, ".phonewrap preview toggle — RESOLVED") — matches
// the prototype's own .desk class mechanism exactly. Default is "phone",
// same as the prototype's `let shareView="phone"`, regardless of the
// visitor's actual device; a real desktop visitor now has to click
// "Desktop" to see that layout, which is a deliberate, disclosed change
// from this page's previous responsive-by-default behaviour.

test("shared review — phone (default)", async ({ page, frank }) => {
  const token = await frank.createSharedLink();
  await page.goto(`/review/${token}`);
  // .phonewrap renders for the loading state too ("Loading…", nothing
  // else) — wait for real content, not just the wrapper.
  await page.waitForSelector(".m-top");
  await expect(page).toHaveScreenshot("shared-review-phone.png");
});

test("shared review — desktop (toggled)", async ({ page, frank }) => {
  const token = await frank.createSharedLink();
  // Wider than the default 1280 viewport — .pw-side (290px) + the 54px gap
  // + .browser (up to 92vw) overflows 1280 once all three are on screen at
  // once, clipping the browser frame. 1600 comfortably fits all three.
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/review/${token}`);
  await page.waitForSelector(".pw-seg");
  await page.click('button[data-sv="desktop"]');
  await page.waitForSelector(".dk-list");
  // .br-url renders the live page URL, which contains this test's randomly
  // generated token — genuinely different every run by design, not a
  // rendering difference. Masked rather than faked with a fixed token,
  // since a fixed token risks a unique-constraint collision if this spec
  // ever runs concurrently with itself.
  await expect(page).toHaveScreenshot("shared-review-desktop.png", {
    mask: [page.locator(".br-url")],
  });
});
