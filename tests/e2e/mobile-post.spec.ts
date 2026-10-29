import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";

// A post's page on a phone (direct instruction): one column, for copying
// its caption and opening its Final Asset, and reading and replying to its
// comments. Final Asset is the team's only; editing stays on a computer.
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const CAPTION = "Nobody misses on purpose.\n\nThey skip the part where you work out what you're aiming at.";
const LINK = "https://drive.google.com/drive/folders/e2e-mobile";

test("on a phone the team copies the caption, opens the Final Asset and replies", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await frank.createCopyVersion(frank.creativeId, 1, { caption: CAPTION });
  await frank.createArtworkVersion(frank.creativeId, 1, "art.png");
  await admin.from("creative_asset_links").insert({ creative_id: frank.creativeId, url: LINK });
  await frank.insertCommentAsStaff("Tighten the hook", "public");

  await frank.loginAsStaff(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const post = page.locator(".mpost");
  await expect(post).toBeVisible({ timeout: 20_000 });
  // The desktop's controls aren't there.
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  await expect(page.locator(".vselbar")).toHaveCount(0);
  await expect(post.locator(".cmt-tools")).toBeHidden();

  // Copied with its paragraphs.
  await post.getByRole("button", { name: "Copy Caption" }).click();
  await expect(post.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(CAPTION);
  const asset = post.getByRole("link", { name: "Final Asset" });
  await expect(asset).toHaveAttribute("href", LINK);
  await expect(asset).toHaveAttribute("target", "_blank");
  // Back to the project.
  await expect(post.getByRole("link", { name: "E2E Test Project" })).toHaveAttribute("href", `/projects/${frank.projectId}`);

  // The comments under it, and a reply.
  const card = post.locator(".cmt", { hasText: "Tighten the hook" });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Reply" }).click();
  await card.locator("textarea").fill("Done, have a look");
  await card.getByRole("button", { name: /^(Reply|Post)$/ }).last().click();
  await expect(post.locator(".cmt p", { hasText: "Done, have a look" })).toBeVisible({ timeout: 15_000 });

  // Nothing wider than the screen.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("on a phone a client copies the caption, with no Final Asset", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await admin.from("creatives").update({ stage: 4 }).eq("id", frank.creativeId);
  await frank.createCopyVersion(frank.creativeId, 1, { caption: CAPTION });
  await admin.from("creative_asset_links").insert({ creative_id: frank.creativeId, url: LINK });

  await frank.loginAsClient(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const post = page.locator(".mpost");
  await expect(post).toBeVisible({ timeout: 20_000 });
  await expect(post.getByRole("button", { name: "Copy Caption" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Final Asset" })).toHaveCount(0);
  // In Client Review, the client has the comments.
  await expect(post.locator(".cmts")).toBeVisible();
});
