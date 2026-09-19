import { test, expect } from "./fixtures";

test("creative review stage", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${frank.creativeId}`);
  await page.waitForSelector(".stage-h");
  await expect(page).toHaveScreenshot("creative-review.png");
});

test("upload artwork modal", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${frank.creativeId}`);
  await page.waitForSelector(".stage-h");

  // Fresh fixture creative has no creative_versions yet, so this is the
  // empty-state trigger (.awaiting), not the topbar's "Upload or Edit".
  await page.click('button:has-text("Upload Artwork")');
  await page.waitForSelector(".scrim .modal");
  await expect(page).toHaveScreenshot("upload-artwork-modal.png");
});
