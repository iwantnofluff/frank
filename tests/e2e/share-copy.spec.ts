import { test, expect } from "./fixtures";

// Two messages to copy a review link with, always both (direct
// instruction): Link + Instructions and Link + Request. What lands on the
// clipboard is read back, not just the button.
test("a review link copies with instructions or with a request", async ({ page, context, frank }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${frank.creativeId}`);
  await page.waitForSelector(".stage-h");
  await page.getByRole("button", { name: "Share for review" }).click();
  await page.click('button:has-text("Create link")');
  const link = (await page.locator(".linkrow code").textContent())!.trim();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Link + Instructions" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Link + Request" })).toBeVisible();
  await expect(dialog).toContainText("Your client picks their name to comment or approve — no account needed.");

  await dialog.getByRole("button", { name: "Link + Instructions" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Link and instructions copied. Paste it wherever you're sending it.");
  const instructions = await page.evaluate(() => navigator.clipboard.readText());
  expect(instructions).toBe(
    [
      "Hello,",
      "",
      `E2E Test Creative is ready for review: ${link}`,
      "",
      "No account needed.",
      "",
      "1. Open the link.",
      "2. Pick your name.",
      "3. Scroll down to comment. You can pause a video to comment on a specific moment.",
      "4. Hit Approve if you’re happy.",
      "",
      "Want to see your full content planner? Create a login from the same link. Optional.",
      "",
      "Any questions, just reply here.",
    ].join("\n"),
  );

  await dialog.getByRole("button", { name: "Link + Request" }).click();
  await expect(dialog.getByRole("button", { name: "Copied" })).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: "Link + Instructions" })).toBeEnabled();
  const request = await page.evaluate(() => navigator.clipboard.readText());
  expect(request).toBe(
    [
      "Hello,",
      "",
      `E2E Test Creative is ready for review: ${link}`,
      "",
      "Comment directly on anything you’d like changed, or hit Approve if you’re happy.",
      "",
      "Any questions, just reply here.",
    ].join("\n"),
  );
});
