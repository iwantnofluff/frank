import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { test, expect, APP_URL, type Frank } from "./fixtures";

// Safe Zones (direct instruction): for a Reel, Story or Short, the team
// turns on what the app covers, over the playing video, in Fullscreen
// (reported directly: the post as it was, the zones once it's full size).
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// A real 3-second MP4, recorded in the test browser (no ffmpeg needed):
// the time is drawn on every frame.
async function recordVideo(page: Page): Promise<Buffer> {
  await page.goto("about:blank");
  const b64 = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 360;
    c.height = 640;
    const g = c.getContext("2d")!;
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: "video/mp4" });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.start();
    const t0 = performance.now();
    await new Promise<void>((done) => {
      function frame() {
        const s = (performance.now() - t0) / 1000;
        g.fillStyle = `hsl(${(s * 90) % 360} 70% 45%)`;
        g.fillRect(0, 0, 360, 640);
        g.fillStyle = "#fff";
        g.font = "bold 90px sans-serif";
        g.fillText(s.toFixed(1), 60, 340);
        if (s < 3) requestAnimationFrame(frame);
        else done();
      }
      frame();
    });
    rec.stop();
    await new Promise((r) => (rec.onstop = r));
    const buf = await new Blob(chunks).arrayBuffer();
    let bin = "";
    new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin);
  });
  return Buffer.from(b64, "base64");
}

// The fixture's post as an Instagram Reel with that video as V1.
async function seedReel(page: Page, frank: Frank) {
  const video = await recordVideo(page);
  await admin.from("creatives").update({ formats: ["ig_reel"], slide_count: null }).eq("id", frank.creativeId);
  const key = `${frank.agencyId}/${frank.creativeId}/seed-reel.mp4`;
  await admin.storage.from("assets").upload(key, video, { contentType: "video/mp4", upsert: true });
  const { data: staffUser } = await admin.from("users").select("id").eq("email", frank.staffEmail).single();
  const { data: asset } = await admin
    .from("assets")
    .insert({
      agency_id: frank.agencyId,
      storage_key: key,
      filename: "reel.mp4",
      mime_type: "video/mp4",
      bytes: video.length,
      created_by: staffUser!.id,
    })
    .select("id")
    .single();
  const { data: version } = await admin
    .from("creative_versions")
    .insert({ creative_id: frank.creativeId, version_no: 1, asset_id: asset!.id, created_by: staffUser!.id })
    .select("id")
    .single();
  return version!.id as string;
}

async function fullscreen(page: Page) {
  await page.getByRole("button", { name: "See the phone full size" }).click();
  await expect(page.getByRole("dialog", { name: "The post full size" })).toBeVisible();
}

test("Safe Zones is in Fullscreen only, over a Reel's playing video, with the Reel as it was", async ({ page, frank }) => {
  test.setTimeout(120_000);
  await seedReel(page, frank);
  await frank.createCopyVersion(frank.creativeId, 1, { caption: "Bakers know that a lot goes into one cake." });
  await page.setViewportSize({ width: 1440, height: 900 });
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  // The Reel as before: the caption under the video, readable.
  const post = page.locator('.ig[data-platform="instagram"]');
  await expect(post.locator(".ig-cap")).toContainText("Bakers know that a lot goes into one cake.", { timeout: 20_000 });
  await expect(post).not.toHaveClass(/story/);
  // No switch on the page itself.
  await expect(page.getByRole("button", { name: /^Safe Zones/ })).toHaveCount(0);

  await fullscreen(page);
  const toggle = page.getByRole("button", { name: /^Safe Zones/ });
  await expect(toggle).toHaveText("Safe Zones Off");
  await expect(post.locator(".safezones")).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  // The video draws its own, in its frame.
  const zones = post.locator('.vframe .safezones[data-kind="reel"]');
  await expect(zones.locator(".safezone-covered")).toHaveText(["Back and create", "Buttons", "Name and caption"]);
  // Exactly over the video's picture, and the video plays under it.
  const frame = (await post.locator(".vframe").boundingBox())!;
  const over = (await zones.boundingBox())!;
  for (const k of ["x", "y", "width", "height"] as const) expect(Math.abs(over[k] - frame[k])).toBeLessThan(3);
  await post.getByRole("button", { name: "Play" }).click();
  await expect.poll(() => post.locator("video").evaluate((v) => (v as HTMLVideoElement).currentTime), { timeout: 10_000 }).toBeGreaterThan(0.3);
  // The video expanded to fill the phone (reported directly: the zones
  // stayed behind): they go with it, exactly over its frame.
  await post.getByRole("button", { name: "Expand video" }).click();
  const fullFrame = post.locator(".vplayer.full .vframe");
  await expect(fullFrame.locator(".safezone-covered")).toHaveText(["Back and create", "Buttons", "Name and caption"]);
  const big = (await fullFrame.boundingBox())!;
  const bigOver = (await fullFrame.locator(".safezones").boundingBox())!;
  for (const k of ["x", "y", "width", "height"] as const) expect(Math.abs(bigOver[k] - big[k])).toBeLessThan(3);
  await expect(fullFrame.locator(".safezones")).toBeVisible();
  await post.getByRole("button", { name: "Collapse video" }).click();
  await expect(post.locator(".vplayer.full")).toHaveCount(0);
  // Feed Crop: the middle 1080×1440, the rest darkened, with or without
  // the zones.
  await page.getByRole("button", { name: "Feed Crop Off" }).click();
  const crop = post.locator('.vframe .safezones[data-kind="feedCrop"]');
  await expect(crop.locator(".safezone-covered")).toHaveText(["Cropped in the feed", "Cropped in the feed"]);
  await expect(zones.locator(".safezone-covered")).toHaveCount(3);
  await page.getByRole("button", { name: "Feed Crop On" }).click();
  await expect(crop).toHaveCount(0);
  // Out of Fullscreen: gone; back in, as it was left.
  await page.keyboard.press("Escape");
  await expect(zones).toHaveCount(0);
  await fullscreen(page);
  await expect(zones.locator(".safezone-covered")).toHaveCount(3);
  await toggle.click();
  await expect(zones).toHaveCount(0);
});

test("Stories, Shorts, posts and carousels have their own zones; other formats and a client have no switch", async ({ page, browser, frank }) => {
  test.setTimeout(120_000);
  await frank.createArtworkVersion(frank.creativeId, 1, "story.png");
  await admin.from("creatives").update({ format: "ig_story", formats: ["ig_story"], slide_count: null }).eq("id", frank.creativeId);
  await page.setViewportSize({ width: 1440, height: 900 });
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await fullscreen(page);
  await page.getByRole("button", { name: /^Safe Zones/ }).click();
  // The guide's 250px top and foot, the good zones inside them.
  await expect(page.locator(".ig.story .safezone-covered")).toHaveText(["Account and progress", "Reply bar"]);
  await expect(page.locator(".ig.story .safezone-good")).toHaveText(["Good zone", "Good zone"]);

  await admin.from("creatives").update({ format: "yt_short", formats: ["yt_short"] }).eq("id", frank.creativeId);
  await page.reload();
  await fullscreen(page);
  await page.getByRole("button", { name: /^Safe Zones/ }).click();
  await expect(page.locator(".yt-short .safezone-covered")).toHaveText(["Search and menu", "Buttons", "Channel, title and audio"]);

  // A post (3:4): its margins; a carousel: the strip on the right.
  await admin.from("creatives").update({ format: "ig_feed", formats: ["ig_feed"] }).eq("id", frank.creativeId);
  await page.reload();
  await fullscreen(page);
  await page.getByRole("button", { name: /^Safe Zones/ }).click();
  const postZones = page.locator('.safezones[data-kind="post"]');
  await expect(postZones.locator(".safezone-covered")).toHaveCount(4);
  await expect(postZones.locator(".safezone-covered span")).toHaveText(["Margin", "Margin"]);
  // Over the whole picture, not a 9:16 frame.
  const pic = (await page.locator(".ig-media").first().boundingBox())!;
  const over = (await postZones.boundingBox())!;
  expect(Math.abs(over.height - pic.height)).toBeLessThan(3);
  await expect(page.getByRole("button", { name: /^Feed Crop/ })).toHaveCount(0);

  await admin.from("creatives").update({ format: "ig_carousel", formats: ["ig_carousel"], slide_count: 2 }).eq("id", frank.creativeId);
  await page.reload();
  await fullscreen(page);
  await page.getByRole("button", { name: /^Safe Zones/ }).click();
  await expect(page.locator('.safezones[data-kind="carousel"] .safezone-covered')).toHaveText(["Count and buttons"]);

  // A format with no zones: no switch.
  await admin.from("creatives").update({ format: "li_image", formats: ["li_image"], slide_count: null }).eq("id", frank.creativeId);
  await page.reload();
  await fullscreen(page);
  await expect(page.getByRole("button", { name: /^Safe Zones/ })).toHaveCount(0);

  // A client sees the post full size, never the switch.
  await admin.from("creatives").update({ format: "ig_story", formats: ["ig_story"], stage: 4 }).eq("id", frank.creativeId);
  const client = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await frank.loginAsClient(client);
  await client.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await expect(client.locator(".ig.story")).toBeVisible({ timeout: 20_000 });
  await fullscreen(client);
  await expect(client.getByRole("button", { name: /^Safe Zones/ })).toHaveCount(0);
});
