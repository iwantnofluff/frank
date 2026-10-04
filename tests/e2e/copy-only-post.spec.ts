import { test, expect, APP_URL } from "./fixtures";

// A post with copy but no artwork still shows, and can be commented on, as
// a post — "No artwork yet" sits where the image would be.

test("a copy-only post shows as a post for staff, clients and a review link", async ({ page, browser, frank }) => {
  test.setTimeout(90_000);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  // Neither copy nor artwork: still the post (direct instruction), each
  // part saying what's missing.
  await expect(page.locator(".postbox .ig-noart")).toContainText("Add the artwork once it has been made.");
  await expect(page.locator(".ig-cap")).toContainText("No copy yet.");
  await expect(page.locator(".ig-cap").getByRole("button", { name: "Write Copy" })).toBeVisible();

  await frank.createCopyVersion(frank.creativeId, 1, { caption: "Copy only, no artwork yet." });
  await page.reload();
  const art = page.locator(".postbox .ig-noart");
  await expect(art).toContainText("No artwork yet");
  await expect(art.getByRole("button", { name: "Upload Artwork" })).toBeVisible();
  await expect(page.locator(".ig-cap")).toContainText("Copy only, no artwork yet.");
  await expect(page.locator(".ig-time")).toContainText("Copy saved");
  await page.getByPlaceholder("Add a comment…").fill("Staff note on a copy-only post");
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await expect(page.getByText("Staff note on a copy-only post")).toBeVisible();

  const clientContext = await browser.newContext();
  const client = await clientContext.newPage();
  await frank.loginAsClient(client);
  await client.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await expect(client.locator(".postbox .ig-noart")).toContainText("hasn't uploaded the artwork");
  await expect(client.locator(".ig-noart button")).toHaveCount(0);
  await expect(client.locator(".ig-cap")).toContainText("Copy only, no artwork yet.");
  await clientContext.close();

  const token = await frank.createSharedLink();
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(`${APP_URL}/review/${token}`);
  // The page renders both its phone and desktop layouts; phone is shown.
  await expect(guest.locator(".phone .ig-noart")).toContainText("No artwork yet", { timeout: 15_000 });
  await expect(guest.locator(".phone")).toContainText("Copy only, no artwork yet.");
  await guestContext.close();
});
