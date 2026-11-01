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
  await expect(post.getByRole("link", { name: "E2E Test Project" })).toHaveAttribute("href", `/projects/${frank.projectId}?post=${frank.creativeId}`);

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

test("on a phone a carousel scrolls under the post's header, and a comment keeps its line breaks", async ({ page, frank }) => {
  test.setTimeout(90_000);
  // A 3-slide carousel with real files, so its count, dots and arrows show.
  await admin.from("creatives").update({ formats: ["ig_carousel"], slide_count: 3 }).eq("id", frank.creativeId);
  const { data: staffUser } = await admin.from("users").select("id").eq("email", frank.staffEmail).single();
  await page.setViewportSize({ width: 400, height: 500 });
  const ids: string[] = [];
  for (const n of [1, 2, 3]) {
    const key = `${frank.agencyId}/${frank.creativeId}/mpost-slide-${n}.png`;
    await page.setContent(`<body style="margin:0;background:#e33"></body>`);
    await admin.storage.from("assets").upload(key, await page.screenshot(), { contentType: "image/png" });
    const { data: a } = await admin
      .from("assets")
      .insert({ agency_id: frank.agencyId, storage_key: key, filename: `s${n}.png`, mime_type: "image/png", bytes: 1, created_by: staffUser!.id })
      .select("id")
      .single();
    ids.push(a!.id);
  }
  const { data: v } = await admin
    .from("creative_versions")
    .insert({ creative_id: frank.creativeId, version_no: 1, asset_id: ids[0], created_by: staffUser!.id })
    .select("id")
    .single();
  await admin.from("creative_version_slides").insert(ids.map((a, i) => ({ creative_version_id: v!.id, position: i + 1, asset_id: a })));
  await frank.insertCommentAsStaff("First line\nSecond line\n\nAfter a blank line", "public");

  await page.setViewportSize({ width: 390, height: 844 });
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const post = page.locator(".mpost");
  const count = post.locator(".car-count");
  await expect(count).toBeVisible({ timeout: 20_000 });
  // Scrolled until the count is under the header: the header is at the very
  // top, and it, not the count, is what's there.
  const header = post.locator(".m-card .ig-h");
  // Measured once the slide has loaded and the page has its full height.
  await expect
    .poll(() => post.locator(".ig-media img").first().evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0))
    .toBe(true);
  const top = (await post.boundingBox())!.y;
  await expect(async () => {
    const start = (await count.boundingBox())!;
    await post.evaluate((el, by) => (el.scrollTop += by), start.y - top - 20);
    expect((await header.boundingBox())!.y).toBe(top);
  }).toPass({ timeout: 10_000 });
  const c = (await count.boundingBox())!;
  const h = (await header.boundingBox())!;
  expect(c.y).toBeLessThan(h.y + h.height);
  const atCount = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest(".ig-h"), [c.x + c.width / 2, c.y + c.height / 2]);
  expect(atCount).toBe(true);

  // The comment shows its line breaks: four lines, not one.
  const words = post.locator(".cmt .cbody", { hasText: "First line" });
  await words.scrollIntoViewIfNeeded();
  const lineHeight = await words.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
  expect((await words.boundingBox())!.height).toBeGreaterThan(lineHeight * 3.5);
});
