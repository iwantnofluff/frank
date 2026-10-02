import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { test, expect, APP_URL, type Frank } from "./fixtures";

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

async function clickTimelineAt(page: Page, scope: string, fraction: number) {
  const track = page.locator(`${scope} .vtrack`);
  // A 9:16 Reel pushes the timeline below the fold.
  await track.scrollIntoViewIfNeeded();
  const box = (await track.boundingBox())!;
  await page.mouse.click(box.x + box.width * fraction, box.y + box.height / 2);
}

const videoTime = (page: Page, scope: string) =>
  page.locator(`${scope} video`).evaluate((v) => (v as HTMLVideoElement).currentTime);

test("on the post page, comments made at a moment sit on the timeline and jump back to it", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const versionId = await seedReel(page, frank);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  // Loaded: the recording is about three seconds (0:02 or 0:03).
  await expect(page.locator(".vtime")).toContainText(/\/ 0:0[23]/, { timeout: 15_000 });

  // Stop half way: a comment is attached to that moment.
  await clickTimelineAt(page, ".ig-media", 0.5);
  const half = await videoTime(page, ".ig-media");
  expect(half).toBeGreaterThan(1.2);
  expect(half).toBeLessThan(1.8);
  const chip = page.locator(".cmts .atchip, aside .atchip").first();
  await expect(chip).toHaveText("At 0:01");
  await page.getByPlaceholder("Add a comment…").last().fill("At the middle");
  await page.getByRole("button", { name: "Post", exact: true }).last().click();
  await expect(page.locator(".cmt", { hasText: "At the middle" })).toContainText("0:01");

  // A pin on the same frame.
  await page.getByTitle("Pin comment").click();
  await page.locator(".ig-media .annot-layer").scrollIntoViewIfNeeded();
  const frame = (await page.locator(".ig-media .annot-layer").boundingBox())!;
  await page.mouse.click(frame.x + frame.width * 0.3, frame.y + frame.height * 0.4);
  await page.locator(".annot-composer textarea").fill("Pin here");
  await page.locator(".annot-composer").getByRole("button", { name: "Post" }).click();
  await expect(page.locator(".cmt", { hasText: "Pin here" })).toContainText("Pin 1 · 0:01");

  const { data: rows } = await admin
    .from("comments")
    .select("body, anchor, creative_version_id")
    .eq("creative_id", frank.creativeId)
    .in("body", ["At the middle", "Pin here"]);
  for (const r of rows!) {
    expect(r.creative_version_id).toBe(versionId);
    expect(Math.abs((r.anchor as { t: number }).t - half)).toBeLessThan(0.05);
  }
  expect(rows!.map((r) => (r.anchor as { type: string }).type).sort()).toEqual(["pin", "time"]);

  // Both are markers; away from that moment the pin isn't on the frame.
  await expect(page.locator(".ig-media .vmark")).toHaveCount(2);
  await clickTimelineAt(page, ".ig-media", 0.02);
  await expect(page.locator(".ig-media .annot-pin")).toHaveCount(0);

  // The pin's marker goes back to its moment, shows the pin, and picks its comment.
  await page.locator(".ig-media .vmark.pin").click();
  expect(Math.abs((await videoTime(page, ".ig-media")) - half)).toBeLessThan(0.05);
  await expect(page.locator(".ig-media .annot-pin")).toHaveCount(1);
  await expect(page.locator(".cmt.act")).toContainText("Pin here");

  // So does picking a comment in the list.
  await clickTimelineAt(page, ".ig-media", 0.95);
  await page.locator(".cmt", { hasText: "At the middle" }).click();
  expect(Math.abs((await videoTime(page, ".ig-media")) - half)).toBeLessThan(0.05);
});

test("on the review link, a guest can comment at a moment and jump back to it", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await seedReel(page, frank);
  const token = await frank.createSharedLink();
  await page.goto(`${APP_URL}/review/${token}`);
  const scope = ".phone .ig-media";
  await expect(page.locator(`${scope} .vtime`)).toContainText(/\/ 0:0[23]/, { timeout: 15_000 });

  await clickTimelineAt(page, scope, 0.5);
  const at = await videoTime(page, scope);
  const phone = page.locator(".phone");
  await expect(phone.locator(".atchip")).toHaveText("At 0:01");
  const picker = phone.locator("select").first();
  if (await picker.count()) await picker.selectOption({ label: "Someone else" }).catch(() => {});
  await phone.getByPlaceholder("Your name").fill("Guest Viewer");
  await phone.getByPlaceholder("Your email").fill("guest@example.invalid");
  await phone.getByPlaceholder("Add a comment…").fill("Guest at a moment");
  await phone.getByRole("button", { name: "Post", exact: true }).click();
  await expect(phone.locator(".m-cmt", { hasText: "Guest at a moment" })).toContainText("0:01", { timeout: 15_000 });
  // Posting reloads the review; the video stays where it was.
  expect(Math.abs((await videoTime(page, scope)) - at)).toBeLessThan(0.05);

  const { data: row } = await admin
    .from("comments")
    .select("anchor, creative_version_id")
    .eq("creative_id", frank.creativeId)
    .eq("body", "Guest at a moment")
    .single();
  expect((row!.anchor as { type: string }).type).toBe("time");
  expect(Math.abs((row!.anchor as { t: number }).t - at)).toBeLessThan(0.05);
  expect(row!.creative_version_id).not.toBeNull();

  // Its badge, and its marker, go back to that moment.
  await clickTimelineAt(page, scope, 0.02);
  await phone.locator(".m-cmt", { hasText: "Guest at a moment" }).getByRole("button", { name: /^Go to/ }).click();
  expect(Math.abs((await videoTime(page, scope)) - at)).toBeLessThan(0.05);
  await expect(page.locator(`${scope} .vmark`)).toHaveCount(1);
});

// A 2-slide carousel: slide 1 an image, slide 2 the recorded video.
async function seedMixedCarousel(page: Page, frank: Frank) {
  const video = await recordVideo(page);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkaPhfDwAEhgGAj4c+ZQAAAABJRU5ErkJggg==",
    "base64",
  );
  await admin.from("creatives").update({ formats: ["ig_carousel"], slide_count: 2 }).eq("id", frank.creativeId);
  const { data: staffUser } = await admin.from("users").select("id").eq("email", frank.staffEmail).single();
  const files = [
    { key: `${frank.agencyId}/${frank.creativeId}/mixed-1.png`, body: png, mime: "image/png", name: "one.png" },
    { key: `${frank.agencyId}/${frank.creativeId}/mixed-2.mp4`, body: video, mime: "video/mp4", name: "two.mp4" },
  ];
  const ids: string[] = [];
  for (const f of files) {
    await admin.storage.from("assets").upload(f.key, f.body, { contentType: f.mime, upsert: true });
    const { data } = await admin
      .from("assets")
      .insert({ agency_id: frank.agencyId, storage_key: f.key, filename: f.name, mime_type: f.mime, bytes: f.body.length, created_by: staffUser!.id })
      .select("id")
      .single();
    ids.push(data!.id);
  }
  const { data: version } = await admin
    .from("creative_versions")
    .insert({ creative_id: frank.creativeId, version_no: 1, asset_id: ids[0], created_by: staffUser!.id })
    .select("id")
    .single();
  await admin.from("creative_version_slides").insert(ids.map((asset_id, i) => ({ creative_version_id: version!.id, position: i + 1, asset_id })));
}

test("a carousel's video slide has its own timeline, and its comments stay on that slide", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await seedMixedCarousel(page, frank);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const media = page.locator(".ig-media");
  await expect(media.locator(".car-count")).toHaveText("1 / 2");
  await expect(media.locator(".vplayer")).toHaveCount(0);

  await media.getByRole("button", { name: "Next slide" }).click();
  await expect(media.locator(".vtime")).toContainText(/\/ 0:0[23]/, { timeout: 15_000 });
  // The dots sit above the video's controls.
  await expect(media.locator(".car-dots.over-video")).toHaveCount(1);
  await clickTimelineAt(page, ".ig-media", 0.5);
  await page.getByPlaceholder("Add a comment…").last().fill("On the video slide");
  // Public, so the client sees it (and its marker) on the review link.
  await page.locator("aside .composer .intog input").last().uncheck();
  await page.getByRole("button", { name: "Post", exact: true }).last().click();
  await expect(page.locator(".cmt", { hasText: "On the video slide" })).toContainText("0:01");
  const { data: row } = await admin.from("comments").select("anchor").eq("creative_id", frank.creativeId).eq("body", "On the video slide").single();
  expect((row!.anchor as { type: string; slide: number }).type).toBe("time");
  expect((row!.anchor as { slide: number }).slide).toBe(2);
  await expect(media.locator(".vmark")).toHaveCount(1);

  // From slide 1, picking that comment goes to slide 2 and its moment.
  await media.getByRole("button", { name: "Previous slide" }).click();
  await expect(media.locator(".car-count")).toHaveText("1 / 2");
  await page.locator(".cmt", { hasText: "On the video slide" }).click();
  await expect(media.locator(".car-count")).toHaveText("2 / 2");
  await expect.poll(async () => Math.abs((await videoTime(page, ".ig-media")) - 1.5)).toBeLessThan(0.4);

  // A guest on the review link: same slide, own timeline.
  const token = await frank.createSharedLink();
  await page.goto(`${APP_URL}/review/${token}`);
  const scope = ".phone .ig-media";
  await expect(page.locator(`${scope} .car-count`)).toHaveText("1 / 2", { timeout: 15_000 });
  await page.locator(scope).getByRole("button", { name: "Next slide" }).click();
  await expect(page.locator(`${scope} .vtime`)).toContainText(/\/ 0:0[23]/, { timeout: 15_000 });
  await expect(page.locator(`${scope} .vmark`)).toHaveCount(1);
  await clickTimelineAt(page, scope, 0.25);
  const phone = page.locator(".phone");
  await phone.getByPlaceholder("Your name").fill("Guest Viewer");
  await phone.getByPlaceholder("Your email").fill("guest@example.invalid");
  await phone.getByPlaceholder("Add a comment…").fill("Guest on slide two");
  await phone.getByRole("button", { name: "Post", exact: true }).click();
  await expect(phone.locator(".m-cmt", { hasText: "Guest on slide two" })).toBeVisible({ timeout: 15_000 });
  const { data: guest } = await admin.from("comments").select("anchor").eq("creative_id", frank.creativeId).eq("body", "Guest on slide two").single();
  expect((guest!.anchor as { slide: number }).slide).toBe(2);
});

// A heavier recording than recordVideo: full Reel size, a high bitrate
// and a sound track, like a phone export.
async function recordHeavyVideo(page: Page): Promise<Buffer> {
  await page.goto(`${APP_URL}/login`);
  const b64 = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 1080;
    c.height = 1920;
    const g = c.getContext("2d")!;
    const audio = new AudioContext();
    const tone = audio.createOscillator();
    const dest = audio.createMediaStreamDestination();
    tone.connect(dest);
    tone.start();
    const stream = new MediaStream([...c.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    // H.264 and AAC, like a phone or editing-app export.
    const rec = new MediaRecorder(stream, { mimeType: "video/mp4;codecs=avc1,mp4a.40.2", videoBitsPerSecond: 12_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.start();
    const t0 = performance.now();
    await new Promise<void>((done) => {
      function frame() {
        const s = (performance.now() - t0) / 1000;
        // Noise-like detail, so the encoder has real work (and bytes) to do.
        for (let i = 0; i < 400; i++) {
          g.fillStyle = `hsl(${(i * 37 + s * 200) % 360} 70% ${30 + (i % 40)}%)`;
          g.fillRect((i * 97 + s * 300) % 1080, (i * 53) % 1920, 60, 60);
        }
        if (s < 4) requestAnimationFrame(frame);
        else done();
      }
      frame();
    });
    rec.stop();
    await new Promise((r) => (rec.onstop = r));
    tone.stop();
    const buf = await new Blob(chunks).arrayBuffer();
    let bin = "";
    new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin);
  });
  return Buffer.from(b64, "base64");
}

test("a video is compressed to a 720p review copy before it's uploaded", async ({ page, frank }) => {
  test.setTimeout(120_000);
  const heavy = await recordHeavyVideo(page);
  await admin.from("creatives").update({ formats: ["ig_reel"], slide_count: null }).eq("id", frank.creativeId);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: "Upload Artwork" }).click();
  await page.locator('.mtabbody input[type="file"]').first().setInputFiles({ name: "phone-export.mp4", mimeType: "video/mp4", buffer: heavy });
  const save = page.getByRole("button", { name: /^Save Version 1$/ }).first();
  await save.click();
  // The uploader shows each stage: compressing, then uploading with its size.
  await expect(page.getByRole("progressbar", { name: "Compressing video" })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".upbar")).toContainText(/Compressing video\s*\d+%/);
  await expect(page.getByRole("progressbar", { name: "Uploading" })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".upbar")).toContainText(/Uploading\s*\d+% · [\d.]+MB of [\d.]+MB/);
  await expect(page.getByText("Saved as version 1.")).toBeVisible({ timeout: 90_000 });

  const { data: v } = await admin
    .from("creative_versions")
    .select("asset:assets(storage_key, bytes, mime_type, filename)")
    .eq("creative_id", frank.creativeId)
    .single();
  const asset = v!.asset as unknown as { storage_key: string; bytes: number; mime_type: string; filename: string };
  expect(asset.mime_type).toBe("video/mp4");
  // This recording is close to random noise, an encoder's worst case; a
  // real 15-second, 28.2MB Reel came out at 1.73MB.
  expect(asset.bytes).toBeLessThan(heavy.length * 0.6);

  // What's stored really is a 720 × 1280 H.264 video with its sound.
  const { data: blob } = await admin.storage.from("assets").download(asset.storage_key);
  const mb = await import("mediabunny");
  const input = new mb.Input({ source: new mb.BufferSource(Buffer.from(await blob!.arrayBuffer())), formats: mb.ALL_FORMATS });
  const video = (await input.getPrimaryVideoTrack())!;
  expect([video.displayWidth, video.displayHeight]).toEqual([720, 1280]);
  expect(video.codec).toBe("avc");
  expect((await input.getPrimaryAudioTrack())?.codec).toBe("aac");
});
