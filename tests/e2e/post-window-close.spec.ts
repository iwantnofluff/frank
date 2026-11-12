import { test, expect, APP_URL } from "./fixtures";

// Closing the post window with something not saved asks first (direct
// instruction: clicking out of a new post lost what was typed without a
// word). Untouched, it closes straight away, a new post or an existing one
// on any tab.
test("closing the post window with unsaved work asks first", async ({ page, frank }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  const outside = () => page.mouse.click(8, 450);

  // A new post, untouched.
  await page.getByRole("button", { name: "New Post", exact: true }).click();
  await expect(page.locator("#nbName")).toBeVisible();
  await outside();
  await expect(page.locator("#nbName")).toHaveCount(0);

  // A new post with a name: Keep Editing keeps it; Escape asks again;
  // Discard closes.
  await page.getByRole("button", { name: "New Post", exact: true }).click();
  await page.fill("#nbName", "Half-made post");
  await outside();
  await expect(page.getByText("Discard This Post?")).toBeVisible();
  await expect(page.getByText("this post isn't created yet. If you close now, what you've entered will be lost.")).toBeVisible();
  await page.getByRole("button", { name: "Keep Editing" }).click();
  await expect(page.locator("#nbName")).toHaveValue("Half-made post");
  await expect(page.getByText("Discard This Post?")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByText("Discard This Post?")).toBeVisible();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(page.locator("#nbName")).toHaveCount(0);

  // An existing post, untouched on each tab: no question.
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  for (const tab of ["Brief", "Production", "Content"]) {
    await page.getByRole("button", { name: "Edit", exact: true }).first().click();
    await page.getByRole("tab", { name: tab }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tab", { name: tab })).toHaveCount(0);
    await expect(page.getByText("Close Without Saving?")).toHaveCount(0);
  }

  // Copy typed and not saved: named in the question.
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await page.getByRole("tab", { name: "Content" }).click();
  await page.locator(".modal textarea").first().fill("A caption not saved yet");
  await outside();
  await expect(page.getByText("the copy isn't saved yet. If you close now, the changes will be lost.")).toBeVisible();
  await page.getByRole("button", { name: "Close Without Saving" }).click();
  await expect(page.getByRole("tab", { name: "Content" })).toHaveCount(0);
});
