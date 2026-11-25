import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { test, expect, APP_URL, type Frank } from "./fixtures";

// A Reel's thumbnail from its own video (direct instruction): in the post
// page's Fullscreen, Use as Thumbnail beside Safe Zones, ready once the
// video's paused; a window in the middle checks the frame, then it's saved
// as the next version; ← → step a frame. In the post window's Thumbnail
// too, as "pick a frame from the video". The team's only.
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

const versions = async (creativeId: string) =>
  (await admin.from("thumbnail_versions").select("version_no, asset:assets(filename, mime_type)").eq("creative_id", creativeId).order("version_no")).data ?? [];

test("a paused frame becomes the Reel's thumbnail, from Fullscreen and in the post window", async ({ page, frank }) => {
  test.setTimeout(120_000);
  await seedReel(page, frank);
  await page.setViewportSize({ width: 1440, height: 900 });
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const player = page.locator(".vplayer").first();
  await expect(player.locator("video")).toBeVisible({ timeout: 20_000 });
  // Not on the page's own video (reported directly: fiddly there).
  await expect(page.getByRole("button", { name: /Use as Thumbnail/ })).toHaveCount(0);

  // Fullscreen: Safe Zones, Feed Crop (a Reel's), Use as Thumbnail, Hide
  // Comments, close.
  await page.getByRole("button", { name: "See the phone full size" }).click();
  const tools = page.locator(".pexpand-tools button");
  await expect(tools).toHaveText(["Safe Zones Off", "Feed Crop Off", "Use as Thumbnail", "Hide Comments", ""]);
  const pick = page.getByRole("button", { name: "Use as Thumbnail" });
  // Playing: dimmed, saying to pause. Paused: ready.
  await player.getByRole("button", { name: "Play" }).click();
  await expect(pick).toBeDisabled();
  await expect(pick).toHaveAttribute("title", "Pause on a frame first");
  await expect.poll(() => player.locator("video").evaluate((v) => (v as HTMLVideoElement).currentTime), { timeout: 10_000 }).toBeGreaterThan(1);
  await player.getByRole("button", { name: "Pause" }).click();
  await expect(pick).toBeEnabled();

  // ← → step a frame (1/30s), in the player.
  const at = () => player.locator("video").evaluate((v) => (v as HTMLVideoElement).currentTime);
  const before = await at();
  await page.keyboard.press("ArrowRight");
  await expect.poll(at).toBeCloseTo(before + 1 / 30, 2);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(at).toBeCloseTo(before, 2);

  // A window in the middle with the frame; Cancel saves nothing.
  await pick.click();
  const dialog = page.getByRole("dialog", { name: "Use as Thumbnail" });
  await expect(dialog.locator(".framedlg img")).toBeVisible();
  await expect(dialog).toContainText("From the video at 0:0");
  const box = (await dialog.boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - 720)).toBeLessThan(40);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  // Still in Fullscreen.
  await expect(page.getByRole("dialog", { name: "The post full size" })).toBeVisible();
  expect(await versions(frank.creativeId)).toHaveLength(0);

  // Saved as V1, a JPEG named for its moment.
  await pick.click();
  await dialog.getByRole("button", { name: "Save as Thumbnail V1" }).click();
  await expect(dialog).toHaveCount(0, { timeout: 20_000 });
  await expect.poll(async () => (await versions(frank.creativeId)).length).toBe(1);
  const v1 = (await versions(frank.creativeId))[0].asset as unknown as { filename: string; mime_type: string };
  expect(v1.mime_type).toBe("image/jpeg");
  expect(v1.filename).toMatch(/^frame-0m0\d(\.\d)?s\.jpg$/);
  await page.getByRole("button", { name: "Close the full-size view" }).click();

  // The post window: its picker's bar button, and the same window.
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("tab", { name: "Content" }).click();
  await page.getByRole("button", { name: "pick a frame from the video" }).click();
  const small = page.locator(".thumb-pick .vplayer");
  await expect(small.locator("video")).toBeVisible();
  await small.getByRole("button", { name: "Play" }).click();
  await page.waitForTimeout(600);
  await small.getByRole("button", { name: "Pause" }).click();
  await small.getByRole("button", { name: "Use This Frame" }).click();
  const use = page.getByRole("dialog", { name: "Use This Frame" });
  await expect(use.locator(".framedlg img")).toBeVisible();
  await use.getByRole("button", { name: "Use This Frame" }).click();
  await expect(page.locator(".thumb-pick")).toHaveCount(0);
  await expect(page.locator('[aria-label="Thumbnail"] .cslot.filled img')).toBeVisible();
  await page.getByRole("button", { name: "Save Thumbnail V2" }).click();
  await expect.poll(async () => (await versions(frank.creativeId)).length, { timeout: 20_000 }).toBe(2);
});

test("a client never gets Use as Thumbnail", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await seedReel(page, frank);
  await admin.from("creatives").update({ stage: 4 }).eq("id", frank.creativeId);
  await page.setViewportSize({ width: 1440, height: 900 });
  await frank.loginAsClient(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const player = page.locator(".vplayer").first();
  await expect(player.locator("video")).toBeVisible({ timeout: 20_000 });
  await player.getByRole("button", { name: "Play" }).click();
  await page.waitForTimeout(500);
  await player.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("button", { name: "See the phone full size" }).click();
  await expect(page.getByRole("button", { name: /Use as Thumbnail/ })).toHaveCount(0);
});
