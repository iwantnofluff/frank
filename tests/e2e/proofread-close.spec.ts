import { test, expect } from "./fixtures";

// Direct instruction: while Frank proofreads, the post window doesn't
// close; a window says why. Frank at work reads in red. The proofread
// request is held, then answered with no suggestions, so no AI is called
// and nothing is asserted on an AI answer.
test("the post window stays open while Frank proofreads, saying why, and the wait reads in red", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await frank.createCopyVersion(frank.creativeId, 1, { caption: "First words" });
  let release: () => void = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/api/ai/proofread", async (route) => {
    await held;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ suggestions: [] }) });
  });

  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("tab", { name: "Content" }).click();
  await page.locator('[data-focus="copy"] textarea').first().fill("First words, fixed");
  await page.getByRole("button", { name: "Save to V1" }).click();

  const wait = page.getByText("Frank is proofreading what you saved");
  await expect(wait).toBeVisible({ timeout: 15_000 });
  // Red, the dots too.
  expect(await wait.evaluate((el) => getComputedStyle(el).color)).toBe("rgb(255, 0, 0)");
  expect(await wait.locator(".cchat-dots i").first().evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 0, 0)");

  // Escape, Cancel: a window explains; the post window stays.
  await page.keyboard.press("Escape");
  const ask = page.getByRole("dialog", { name: "Still Proofreading" });
  await expect(ask).toContainText("Frank is still proofreading. Keep this window open until the suggestions are in, then close.");
  await ask.getByRole("button", { name: "Close" }).click();
  await expect(ask).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(ask).toBeVisible();
  await ask.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("tab", { name: "Content" })).toBeVisible();

  // Done: it closes as usual.
  release();
  await expect(wait).toHaveCount(0, { timeout: 15_000 });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".modal")).toHaveCount(0);
});

test("Save and Close while Frank proofreads keeps the window open, saying why", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await frank.createCopyVersion(frank.creativeId, 1, { caption: "First words" });
  let release: () => void = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/api/ai/proofread", async (route) => {
    await held;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ suggestions: [] }) });
  });
  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("tab", { name: "Content" }).click();
  await page.locator('[data-focus="copy"] textarea').first().fill("Brand new words");
  await page.getByRole("button", { name: "Save to V1" }).click();
  await expect(page.getByText("Frank is proofreading what you saved")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Save and Close" }).click();
  const ask = page.getByRole("dialog", { name: "Still Proofreading" });
  await expect(ask).toBeVisible();
  await ask.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("tab", { name: "Content" })).toBeVisible();
  release();
  await expect(page.getByText("Frank is proofreading what you saved")).toHaveCount(0, { timeout: 15_000 });
  await page.getByRole("button", { name: "Save and Close" }).click();
  await expect(page.locator(".modal")).toHaveCount(0);
});
