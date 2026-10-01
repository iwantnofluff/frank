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
