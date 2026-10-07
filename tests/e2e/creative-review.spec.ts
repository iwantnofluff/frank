import { test, expect } from "./fixtures";

test("creative review stage", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${frank.creativeId}`);
  await page.waitForSelector(".stage-h");
  // useIsStaff (and with it the header's agency logo, .hbrand-agency) resolves independently
  // and fails closed (hidden) until it does — wait for it too, or this
  // screenshot can race ahead under worker concurrency and land on a
  // rail missing Settings.
  await page.waitForSelector(".hbrand-agency");
  await expect(page).toHaveScreenshot("creative-review.png");
});

test("upload artwork modal", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${frank.creativeId}`);
  await page.waitForSelector(".stage-h");
  await page.waitForSelector(".hbrand-agency");

  // Fresh fixture creative has no creative_versions yet, so this is the
  // empty artwork's trigger, not the topbar's "Upload or Edit".
  await page.click('button:has-text("Upload Artwork")');
  await page.waitForSelector(".scrim .modal");
  // The AI button (Draft with Frank) is greyed until the agency's model
  // setting loads — wait for it to be ready, or the
  // screenshot races it (this was the test's long-standing intermittent diff).
  await expect(page.getByRole("button", { name: "Draft with Frank" })).toBeEnabled();
  await expect(page).toHaveScreenshot("upload-artwork-modal.png");
});
