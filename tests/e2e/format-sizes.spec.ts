import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const sizesOf = async (id: string) => (await admin.from("creatives").select("sizes").eq("id", id).single()).data!.sizes;

// A size per format (phase139, decided directly): each starts at its
// default, can be changed in the post window under Format, and the review
// screen and the review link draw the post at that shape. Only a size other
// than the default is kept.
test("a format's size is chosen under Format, and the post is drawn at it", async ({ page, frank }) => {
  test.setTimeout(150_000);
  await admin.from("creatives").update({ format: "ig_feed", formats: ["ig_feed", "li_image"] }).eq("id", frank.creativeId);
  await frank.loginAsStaff(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const media = page.locator(".ig-media .awaiting").first();
  await expect(media).toBeVisible({ timeout: 20_000 });
  const shape = () => media.evaluate((e) => getComputedStyle(e).aspectRatio);
  expect(await shape()).toContain("1080 / 1350");

  const open = async () => {
    await expect(async () => {
      await page.getByRole("button", { name: "Edit", exact: true }).first().click();
      await expect(page.getByRole("tab", { name: "Brief" })).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 30_000 });
    await page.getByRole("tab", { name: "Brief" }).click();
  };
  await open();
  const ig = page.getByLabel("Instagram Post size");
  expect(await ig.locator("option").allTextContents()).toEqual([
    "1080 × 1350 · 4:5 (default)",
    "1080 × 1080 · 1:1",
    "1080 × 566 · 1.91:1",
    "Custom size",
  ]);
  await ig.selectOption({ label: "1080 × 1080 · 1:1" });
  await page.getByLabel("LinkedIn Single Image size").selectOption("custom");
  await page.getByLabel("LinkedIn Single Image width").fill("1200");
  await page.getByLabel("LinkedIn Single Image height").fill("900");
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await expect.poll(() => sizesOf(frank.creativeId), { timeout: 10_000 }).toEqual({ ig_feed: { w: 1080, h: 1080 }, li_image: { w: 1200, h: 900 } });
  await page.keyboard.press("Escape");
  await expect.poll(shape).toContain("1080 / 1080");

  // Back to the default: nothing kept for it.
  await open();
  await page.getByLabel("Instagram Post size").selectOption({ label: "1080 × 1350 · 4:5 (default)" });
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await expect.poll(() => sizesOf(frank.creativeId), { timeout: 10_000 }).toEqual({ li_image: { w: 1200, h: 900 } });
  await page.keyboard.press("Escape");

  // The review link draws the main format at its chosen size.
  await admin.from("creatives").update({ format: "li_image", formats: ["li_image", "ig_feed"] }).eq("id", frank.creativeId);
  const token = await frank.createSharedLink();
  await page.goto(`${APP_URL}/review/${token}`);
  const shared = page.locator(".awaiting.ig-noart").first();
  await expect(shared).toBeVisible({ timeout: 20_000 });
  expect(await shared.evaluate((e) => getComputedStyle(e).aspectRatio)).toContain("1200 / 900");
});

test("the database refuses a size that isn't whole pixels", async ({ frank }) => {
  for (const bad of [{ ig_feed: { w: 0, h: 1350 } }, { ig_feed: { w: "1080", h: 1350 } }, { ig_feed: { w: 1080 } }, { ig_feed: { w: 10.5, h: 10 } }]) {
    const { error } = await admin.from("creatives").update({ sizes: bad }).eq("id", frank.creativeId);
    expect(error?.code).toBe("23514");
  }
});
