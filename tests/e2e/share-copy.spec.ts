import { test, expect } from "./fixtures";

// Three ways to copy a review link, always all (direct instruction):
// Link + Request, Link + Instructions and Link Only. What lands on the
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
  // The fullest first (direct instruction).
  await expect(dialog.locator(".sharecopy button")).toHaveText(["Link + Request", "Link + Instructions", "Link Only"]);
  await expect(dialog).toContainText("Your client picks their name to comment or approve — no account needed.");

  await dialog.getByRole("button", { name: "Link + Instructions" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Link and instructions copied. Paste it wherever you're sending it.");
  const instructions = await page.evaluate(() => navigator.clipboard.readText());
  expect(instructions).toBe(
    [
      "Hello,",
      "",
      'The post "E2E Test Creative" is ready for review:',
      "",
      link,
      "",
      "No account needed.",
      "",
      "1. Open the link.",
      "2. Pick your name.",
      "3. Scroll down to comment. You can pause a video to comment on a specific moment.",
      "4. Hit Approve if you’re happy.",
      "",
      "Want to see your full content planner? Create a login using the same link. Optional.",
      "",
      "Any questions? Just reply here.",
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
      'The post "E2E Test Creative" is ready for review:',
      "",
      link,
      "",
      "Comment directly on anything you’d like changed, or hit Approve if you’re happy.",
      "",
      "Any questions? Just reply here.",
    ].join("\n"),
  );

  await dialog.getByRole("button", { name: "Link Only" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Link copied. Paste it wherever you're sending it.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
});

// Each copy button shows its whole message on hover (direct instruction),
// line breaks and all, and it goes again when the pointer leaves.
test("hovering a copy button shows the message it copies", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${frank.creativeId}`);
  await page.waitForSelector(".stage-h");
  await page.getByRole("button", { name: "Share for review" }).click();
  await page.click('button:has-text("Create link")');
  const link = (await page.locator(".linkrow code").textContent())!.trim();
  const dialog = page.getByRole("dialog");
  const preview = page.locator(".msgpop");

  await dialog.getByRole("button", { name: "Link + Request" }).hover();
  await expect(preview).toBeVisible();
  const text = await preview.locator(".cp-row").innerText();
  expect(text).toContain('Hello,\n\nThe post "E2E Test Creative" is ready for review:');
  expect(text).toContain(link);
  expect(text).toContain("Any questions? Just reply here.");

  await dialog.getByRole("button", { name: "Link Only" }).hover();
  await expect(preview.locator(".cp-row")).toHaveText(link);

  await dialog.locator(".linkrow code").hover();
  await expect(preview).toHaveCount(0);
});

// Several posts: the message still names a post, this one, "and others"
// (direct instruction: it named the project).
test("a link for several posts names this one, and others", async ({ page, context, frank }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await frank.createCreativeAtStage(4, "Second Post");
  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${frank.creativeId}`);
  await page.waitForSelector(".stage-h");
  await page.getByRole("button", { name: "Share for review" }).click();
  await page.click('button[role="radio"]:has-text("Multiple Posts")');
  await page.locator(".pktile", { hasText: "Second Post" }).click();
  await page.click('button:has-text("Create link")');
  const dialog = page.getByRole("dialog");
  for (const name of ["Link + Request", "Link + Instructions"]) {
    await dialog.getByRole("button", { name }).click();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain('Hello,\n\nThe post "E2E Test Creative", and others are ready for review:\n\n');
    expect(text).not.toContain("project");
  }
});
