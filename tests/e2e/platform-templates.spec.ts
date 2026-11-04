import { createClient } from "@supabase/supabase-js";
import zlib from "node:zlib";
import { test, expect, APP_URL } from "./fixtures";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// A post as its platform shows it (decided directly): Instagram as before,
// a Meta ad Sponsored with its call to action, Facebook and LinkedIn as
// theirs. A post with several formats picks which to show it as, on the
// post page and on the review link.
test("a post is drawn as its platform shows it, and several formats can each be shown", async ({ page, frank }) => {
  test.setTimeout(150_000);
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  await admin.from("creatives").update({ format: "ig_feed", formats: ["ig_feed", "meta_feed", "fb_feed", "li_sponsored"] }).eq("id", frank.creativeId);
  await admin.from("copy_versions").insert({
    creative_id: frank.creativeId,
    version_no: 1,
    source: "in_app_edit",
    created_by: staffId,
    fields: {
      caption: "Trials open this Saturday.",
      primary: "Book a slot before Friday.",
      headline: "U-14 trials, this Saturday",
      cta: "Book now",
    },
  });

  await frank.loginAsStaff(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const post = page.locator(".pf-scroll [data-platform]");
  await expect(post).toHaveAttribute("data-platform", "instagram", { timeout: 20_000 });
  await expect(post.locator(".ig-cap")).toContainText("Trials open this Saturday.");
  // More than three formats: a list to pick from.
  const sw = page.getByLabel("Show the post as");
  await expect(sw).toHaveValue("ig_feed");

  await sw.selectOption({ label: "Meta Feed Ad" });
  await expect(post).toHaveAttribute("data-platform", "instagram");
  await expect(post.locator(".ig-h")).toContainText("Sponsored");
  await expect(post.locator(".pp-ctabar")).toContainText("U-14 trials, this Saturday");
  await expect(post.locator(".pp-ctabar")).toContainText("Book now");
  await expect(post.locator(".ig-cap")).toContainText("Book a slot before Friday.");

  await sw.selectOption({ label: "Facebook Post" });
  await expect(post).toHaveAttribute("data-platform", "facebook");
  await expect(post.locator(".pp-text")).toContainText("Trials open this Saturday.");
  await expect(post.locator(".pp-acts")).toContainText("Share");

  await sw.selectOption({ label: "LinkedIn Sponsored Content" });
  await expect(post).toHaveAttribute("data-platform", "linkedin");
  await expect(post.locator(".ig-h")).toContainText("Promoted");
  await expect(post.locator(".pp-text")).toContainText("Book a slot before Friday.");
  await expect(post.locator(".pp-acts")).toContainText("Repost");

  // The review link, with two formats: each a button.
  await admin.from("creatives").update({ format: "ig_feed", formats: ["ig_feed", "fb_feed"] }).eq("id", frank.creativeId);
  const token = await frank.createSharedLink();
  await page.goto(`${APP_URL}/review/${token}`);
  const shared = page.locator(".dk-card [data-platform]");
  await expect(shared).toHaveAttribute("data-platform", "instagram", { timeout: 20_000 });
  const buttons = page.locator(".dk-fmt");
  await expect(buttons.getByRole("button", { name: "Instagram Post" })).toHaveAttribute("aria-pressed", "true");
  await buttons.getByRole("button", { name: "Facebook Post" }).click();
  await expect(shared).toHaveAttribute("data-platform", "facebook");
  await expect(shared.locator(".pp-text")).toContainText("Trials open this Saturday.");
});

// YouTube, Pinterest, WhatsApp, SMS, Push and Google ads, each as its own
// platform shows it; the text-only ones show no artwork.
test("YouTube, Pinterest, messages and Google ads each have their own look", async ({ page, frank }) => {
  test.setTimeout(150_000);
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  const formats = ["yt_video", "yt_preroll", "pin", "wa_broadcast", "sms", "push", "g_rsa", "g_display"];
  await admin.from("creatives").update({ format: formats[0], formats }).eq("id", frank.creativeId);
  await admin.from("copy_versions").insert({
    creative_id: frank.creativeId,
    version_no: 1,
    source: "in_app_edit",
    created_by: staffId,
    fields: {
      title: "What to expect at trials",
      description: "Timings, kit and what the coaches look for.",
      headline: "Trials this Saturday\nBook a free slot",
      cta: "Book now",
      body: "Reply YES to hold a slot.",
    },
  });
  await frank.loginAsStaff(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const post = page.locator(".pf-scroll [data-platform]");
  await expect(post).toHaveAttribute("data-platform", "youtube", { timeout: 20_000 });
  await expect(post.locator(".yt-title")).toHaveText("What to expect at trials");
  await expect(post.locator(".yt-desc")).toHaveText("Timings, kit and what the coaches look for.");
  const sw = page.getByLabel("Show the post as");

  const looks: [string, string, string, string][] = [
    ["yt_preroll", "youtube", ".pp-ctabar", "Trials this Saturday"],
    ["pin", "pinterest", ".pin-text", "What to expect at trials"],
    ["wa_broadcast", "whatsapp", ".wa-text", "Reply YES to hold a slot."],
    ["sms", "sms", ".sms-bubble", "Reply YES to hold a slot."],
    ["push", "push", ".push-card", "What to expect at trials"],
    ["g_rsa", "google", ".gs-head", "Trials this Saturday | Book a free slot"],
    ["g_display", "web", ".webad-native", "Trials this Saturday"],
  ];
  for (const [format, platform, part, words] of looks) {
    await sw.selectOption(format);
    await expect(post).toHaveAttribute("data-platform", platform);
    await expect(post.locator(part)).toContainText(words);
  }
  // A pre-roll's bar shows only the first headline.
  await sw.selectOption("yt_preroll");
  await expect(post.locator(".pp-ctabar")).not.toContainText("Book a free slot");
  // The text-only formats have no artwork.
  for (const format of ["sms", "push", "g_rsa"]) {
    await sw.selectOption(format);
    await expect(post.locator(".ig-media")).toHaveCount(0);
  }
});

// Other Content's formats sit in an iPad (decided directly): an Amazon
// product page, an email in the iPad's mail, a web page in its browser, and
// print on a plain board; social formats stay in the phone.
test("Other Content's formats are shown in an iPad", async ({ page, frank }) => {
  test.setTimeout(150_000);
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  const formats = ["amz_gallery", "em_full", "blog", "print"];
  await admin.from("creatives").update({ format: formats[0], formats, slide_count: null }).eq("id", frank.creativeId);
  await admin.from("copy_versions").insert({
    creative_id: frank.creativeId,
    version_no: 1,
    source: "in_app_edit",
    created_by: staffId,
    fields: {
      title: "Whey Protein Isolate, 1kg",
      bullets: "27g protein a scoop\nNo added sugar",
      subject: "Your November box is here",
      headline: "Protein that tastes like a treat",
    },
  });
  await frank.loginAsStaff(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const post = page.locator(".pf-scroll [data-platform]");
  await expect(post).toHaveAttribute("data-platform", "amazon", { timeout: 20_000 });
  await expect(page.locator(".phoneframe")).toHaveClass(/tablet/);
  // No phone "Posts" bar on an iPad.
  await expect(page.locator(".phoneframe .lpv-bar")).toHaveCount(0);
  await expect(post.locator(".amz-info h3")).toHaveText("Whey Protein Isolate, 1kg");
  await expect(post.locator(".amz-info li")).toHaveText(["27g protein a scoop", "No added sugar"]);
  const sw = page.getByLabel("Show the post as");
  await sw.selectOption("em_full");
  await expect(post).toHaveAttribute("data-platform", "email");
  await expect(post.locator(".mail-head h3")).toHaveText("Your November box is here");
  // Just the message: no inbox beside it.
  await expect(post.locator(".mail-list")).toHaveCount(0);
  await sw.selectOption("blog");
  await expect(post).toHaveAttribute("data-platform", "browser");
  await sw.selectOption("print");
  await expect(post).toHaveAttribute("data-platform", "board");
  // A4 (2480 × 3508) is upright: so is the iPad, a fixed size.
  await expect(page.locator(".phoneframe")).toHaveClass(/portrait/);
  // A slide (16:9) turns it on its side.
  await admin.from("creatives").update({ format: "deck", formats: ["deck"] }).eq("id", frank.creativeId);
  await page.reload();
  await expect(post).toHaveAttribute("data-platform", "board", { timeout: 20_000 });
  await expect(page.locator(".phoneframe")).not.toHaveClass(/portrait/);

  // A social format is back in the phone.
  await admin.from("creatives").update({ format: "ig_feed", formats: ["ig_feed", "print"] }).eq("id", frank.creativeId);
  await page.reload();
  await expect(post).toHaveAttribute("data-platform", "instagram", { timeout: 20_000 });
  await expect(page.locator(".phoneframe")).not.toHaveClass(/tablet/);
  await expect(page.locator(".phoneframe .lpv-bar")).toContainText("Posts");
});

// A small gradient image, for artwork with a known shape.
function png(w: number, h: number): Buffer {
  const T = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = T[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const h0 = Buffer.alloc(13); h0.writeUInt32BE(w, 0); h0.writeUInt32BE(h, 4); h0[8] = 8; h0[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = Math.round(240 * (x / w)); raw[o + 1] = Math.round(120 + 100 * (y / h)); raw[o + 2] = 200; }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", h0), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// Other Creative has no set size: the iPad, a fixed size, turns to suit the
// artwork (upright for tall, on its side for wide), and the artwork shows
// whole and centred, as large as fits (decided directly).
for (const [shape, w, h] of [["tall", 480, 600], ["wide", 900, 400]] as const) {
  test(`Other Creative's ${shape} artwork shows whole on an iPad turned to suit it`, async ({ page, frank }) => {
    test.setTimeout(120_000);
    const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
    await admin.from("creatives").update({ format: "general", formats: ["general"] }).eq("id", frank.creativeId);
    const img = png(w, h);
    const path = `${frank.agencyId}/${frank.creativeId}/${crypto.randomUUID()}-art.png`;
    await admin.storage.from("assets").upload(path, img, { contentType: "image/png" });
    const { data: asset } = await admin.from("assets").insert({ agency_id: frank.agencyId, storage_key: path, filename: "art.png", mime_type: "image/png", bytes: img.length, created_by: staffId }).select("id").single();
    await admin.from("creative_versions").insert({ creative_id: frank.creativeId, version_no: 1, asset_id: asset!.id, created_by: staffId });
    await frank.loginAsStaff(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
    const art = page.locator(".tb.board .ig-media img");
    await expect(art).toBeVisible({ timeout: 20_000 });
    const frame = page.locator(".phoneframe");
    if (shape === "tall") await expect(frame).toHaveClass(/portrait/);
    else await expect(frame).not.toHaveClass(/portrait/);
    // Whole, centred, and as large as fits.
    const room = page.locator(".tb.board .ig-media");
    await expect
      .poll(async () => {
        const a = (await art.boundingBox())!;
        const m = (await room.boundingBox())!;
        // As large as fits: it reaches the screen's edges one way or the other.
        const fills = Math.min(Math.abs(a.height - m.height), Math.abs(a.width - m.width));
        const centred = Math.abs(a.x + a.width / 2 - (m.x + m.width / 2)) + Math.abs(a.y + a.height / 2 - (m.y + m.height / 2));
        return Math.max(fills, centred);
      })
      // The frame is scaled to fit, so a pixel or two of rounding.
      .toBeLessThan(2.5);
    const box = (await art.boundingBox())!;
    expect(Math.abs(box.width / box.height - w / h)).toBeLessThan(0.02);
  });
}

// An email: just the message, the iPad upright as in its Mail (decided
// directly), the email the screen's full width under its subject and sender.
test("an email reads on an upright iPad, full width under its subject", async ({ page, frank }) => {
  test.setTimeout(120_000);
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  await admin.from("creatives").update({ format: "em_full", formats: ["em_full"] }).eq("id", frank.creativeId);
  const img = png(480, 600);
  const path = `${frank.agencyId}/${frank.creativeId}/${crypto.randomUUID()}-art.png`;
  await admin.storage.from("assets").upload(path, img, { contentType: "image/png" });
  const { data: asset } = await admin.from("assets").insert({ agency_id: frank.agencyId, storage_key: path, filename: "art.png", mime_type: "image/png", bytes: img.length, created_by: staffId }).select("id").single();
  await admin.from("creative_versions").insert({ creative_id: frank.creativeId, version_no: 1, asset_id: asset!.id, created_by: staffId });
  await frank.loginAsStaff(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const art = page.locator(".tb.mail .ig-media img");
  await expect(art).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".phoneframe")).toHaveClass(/portrait/);
  await expect
    .poll(async () => {
      const a = (await art.boundingBox())!;
      const sc = (await page.locator(".pf-screen").boundingBox())!;
      const head = (await page.locator(".mail-head").boundingBox())!;
      // Full width, straight under the head.
      return Math.max(Math.abs(a.x - sc.x), Math.abs(a.width - sc.width), Math.abs(a.y - (head.y + head.height)));
    })
    .toBeLessThan(1.5);
});

// The table's Creative column (reported directly: it still showed the old
// phone): the cell's small device and the preview on hover take the post's
// look, a phone for social formats and an iPad for Other Content's.
test("the table's Creative cell and its preview take the post's look", async ({ page, frank }) => {
  test.setTimeout(150_000);
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  const addArt = async (creativeId: string, w: number, h: number) => {
    const img = png(w, h);
    const path = `${frank.agencyId}/${creativeId}/${crypto.randomUUID()}-art.png`;
    await admin.storage.from("assets").upload(path, img, { contentType: "image/png" });
    const { data: asset } = await admin.from("assets").insert({ agency_id: frank.agencyId, storage_key: path, filename: "art.png", mime_type: "image/png", bytes: img.length, created_by: staffId }).select("id").single();
    await admin.from("creative_versions").insert({ creative_id: creativeId, version_no: 1, asset_id: asset!.id, created_by: staffId });
  };
  // A Facebook post this month, in the Content Planner.
  await admin.from("creatives").update({ format: "fb_feed", formats: ["fb_feed"], scheduled_at: new Date().toISOString() }).eq("id", frank.creativeId);
  await addArt(frank.creativeId, 600, 315);
  // An Other Creative post due today, in an Other Content project.
  const other = await frank.createContinuousProject();
  const mem = (await admin.from("memberships").select("id").eq("user_id", staffId).eq("agency_id", frank.agencyId).single()).data!;
  await admin.from("project_access").insert({ membership_id: mem.id, project_id: other });
  const post = await frank.createContinuousCreative(other, { name: "Hoarding trial", dueOn: new Date().toISOString().slice(0, 10) });
  await admin.from("creatives").update({ format: "general", formats: ["general"] }).eq("id", post);
  await addArt(post, 480, 600);

  await frank.loginAsStaff(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  const cell = page.locator(".artcell").first();
  await expect(cell.locator("img")).toBeVisible({ timeout: 20_000 });
  await expect(cell.locator(".artmini")).not.toHaveClass(/tablet/);
  await cell.hover();
  await expect(page.locator(".evpop.phonepop [data-platform]")).toHaveAttribute("data-platform", "facebook", { timeout: 10_000 });
  await expect(page.locator(".evpop.phonepop")).not.toHaveClass(/tabletpop/);

  await page.goto(`${APP_URL}/projects/${other}`);
  await expect(cell.locator("img")).toBeVisible({ timeout: 20_000 });
  // A small iPad, upright for tall artwork (480 × 600): 820 × 1180.
  await expect(cell.locator(".artmini")).toHaveClass(/tablet/);
  await expect
    .poll(async () => {
      const b = (await cell.locator(".artmini").boundingBox())!;
      return Math.round((b.width / b.height) * 10) / 10;
    })
    .toBe(0.7);
  await cell.hover();
  await expect(page.locator(".evpop.tabletpop [data-platform]")).toHaveAttribute("data-platform", "board", { timeout: 10_000 });
  await expect(page.locator(".evpop.tabletpop")).toHaveClass(/portrait/);
});
