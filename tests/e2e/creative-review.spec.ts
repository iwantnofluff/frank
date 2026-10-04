import { test, expect } from "./fixtures";

test("creative review stage", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${frank.creativeId}`);
  await page.waitForSelector(".stage-h");
  // useIsStaff (NavRail's Settings link, #navSet) resolves independently
  // and fails closed (hidden) until it does — wait for it too, or this
  // screenshot can race ahead under worker concurrency and land on a
  // rail missing Settings.
  await page.waitForSelector("#navSet");
  await expect(page).toHaveScreenshot("creative-review.png");
});

test("upload artwork modal", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${frank.creativeId}`);
  await page.waitForSelector(".stage-h");
  await page.waitForSelector("#navSet");

  // Fresh fixture creative has no creative_versions yet, so this is the
  // empty artwork's trigger, not the topbar's "Upload or Edit".
  await page.click('button:has-text("Upload Artwork")');
  await page.waitForSelector(".scrim .modal");
  // The AI button reads "Write with AI" until the agency's model setting
  // loads, then "Write with {model}" — wait for the settled label, or the
  // screenshot races it (this was the test's long-standing intermittent diff).
  await expect(page.getByRole("button", { name: /^Write with (?!AI)/ })).toBeVisible();
  await expect(page).toHaveScreenshot("upload-artwork-modal.png");
});
