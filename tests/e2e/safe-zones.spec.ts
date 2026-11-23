import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { test, expect, APP_URL, type Frank } from "./fixtures";

// Safe Zones (direct instruction): for a Reel, Story or Short, the team
// turns on what the app covers, over the playing video; a Reel is drawn
// full screen, as Instagram shows it.
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

test("a Reel is full screen, and Safe Zones shows what Instagram covers over the playing video", async ({ page, frank }) => {
  test.setTimeout(120_000);
  await seedReel(page, frank);
  await frank.createCopyVersion(frank.creativeId, 1, { caption: "Bakers know that a lot goes into one cake." });
  await page.setViewportSize({ width: 1440, height: 900 });
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const reel = page.locator(".ig.story.reel");
  await expect(reel).toBeVisible({ timeout: 20_000 });
  // Instagram's Reel: buttons down the side, the caption over the foot, no reply bar.
  await expect(reel.locator(".reel-acts")).toBeVisible();
  await expect(reel.locator(".ig-cap")).toContainText("Bakers know that a lot goes into one cake.");
  await expect(reel.locator(".ig-reply")).toHaveCount(0);

  // Off to begin with; on, the three covered areas over the video.
  const zones = reel.locator(".safezones");
  await expect(zones).toHaveCount(0);
  await page.getByLabel("Safe Zones").selectOption("on");
  await expect(zones.locator(".safezone-covered")).toHaveText(["Account and menu", "Buttons", "Name, caption and audio"]);
  await expect(zones.locator(".safezone-safe")).toHaveCount(1);
  // Laid over the video's own frame, and the video still plays under it.
  const media = (await reel.locator(".ig-media").boundingBox())!;
  const over = (await zones.boundingBox())!;
  expect(Math.abs(over.width - media.width)).toBeLessThan(2);
  expect(Math.abs(over.height - media.height)).toBeLessThan(2);
  await reel.getByRole("button", { name: "Play" }).click();
  await expect.poll(() => reel.locator("video").evaluate((v) => (v as HTMLVideoElement).currentTime), { timeout: 10_000 }).toBeGreaterThan(0.3);
  // Off again.
  await page.getByLabel("Safe Zones").selectOption("off");
  await expect(zones).toHaveCount(0);
});

test("a Story and a Short have their own zones; a feed post and a client have no switch", async ({ page, browser, frank }) => {
  test.setTimeout(120_000);
  await frank.createArtworkVersion(frank.creativeId, 1, "story.png");
  await admin.from("creatives").update({ format: "ig_story", formats: ["ig_story"], slide_count: null }).eq("id", frank.creativeId);
  await page.setViewportSize({ width: 1440, height: 900 });
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await page.getByLabel("Safe Zones").selectOption("on");
  await expect(page.locator(".ig.story .safezone-covered")).toHaveText(["Account and progress", "Reply bar or call to action"]);

  await admin.from("creatives").update({ format: "yt_short", formats: ["yt_short"] }).eq("id", frank.creativeId);
  await page.reload();
  await page.getByLabel("Safe Zones").selectOption("on");
  await expect(page.locator(".yt-short .safezone-covered")).toHaveText(["Search and menu", "Buttons", "Channel, title and audio"]);

  await admin.from("creatives").update({ format: "ig_feed", formats: ["ig_feed"] }).eq("id", frank.creativeId);
  await page.reload();
  await expect(page.locator(".ig")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("Safe Zones")).toHaveCount(0);

  // A client sees the post, never the switch.
  await admin.from("creatives").update({ format: "ig_story", formats: ["ig_story"], stage: 4 }).eq("id", frank.creativeId);
  const client = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await frank.loginAsClient(client);
  await client.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await expect(client.locator(".ig.story")).toBeVisible({ timeout: 20_000 });
  await expect(client.getByLabel("Safe Zones")).toHaveCount(0);
});
