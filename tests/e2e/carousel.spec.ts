import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { test, expect, APP_URL, type Frank } from "./fixtures";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function picture(page: Page, colour: string, name: string) {
  const b64 = await page.evaluate((c) => {
    const cv = document.createElement("canvas");
    cv.width = 400;
    cv.height = 500;
    const g = cv.getContext("2d")!;
    g.fillStyle = c;
    g.fillRect(0, 0, 400, 500);
    return cv.toDataURL("image/png").split(",")[1];
  }, colour);
  return { name, mimeType: "image/png", buffer: Buffer.from(b64, "base64") };
}

// A 1×1 PNG, enough for a slide to render and take pins.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkaPhfDwAEhgGAj4c+ZQAAAABJRU5ErkJggg==",
  "base64",
);

// The fixture's post as a 3-slide Instagram Carousel with one version of
// three slides, seeded directly (none of these rows depend on who's
// calling), with real files in storage so each slide renders.
async function seedCarousel(frank: Frank) {
  await admin.from("creatives").update({ formats: ["ig_carousel"], slide_count: 3 }).eq("id", frank.creativeId);
  const { data: staffUser } = await admin.from("users").select("id").eq("email", frank.staffEmail).single();
  const { data: assets } = await admin
    .from("assets")
    .insert(
      [1, 2, 3].map((n) => ({
        agency_id: frank.agencyId,
        storage_key: `${frank.agencyId}/${frank.creativeId}/seed-slide-${n}.png`,
        filename: `slide-${n}.png`,
        mime_type: "image/png",
        bytes: 1,
        created_by: staffUser!.id,
      })),
    )
    .select("id");
  for (const n of [1, 2, 3]) {
    await admin.storage
      .from("assets")
      .upload(`${frank.agencyId}/${frank.creativeId}/seed-slide-${n}.png`, PNG, { contentType: "image/png" });
  }
  const { data: version } = await admin
    .from("creative_versions")
    .insert({ creative_id: frank.creativeId, version_no: 1, asset_id: assets![0].id, created_by: staffUser!.id })
    .select("id")
    .single();
  await admin
    .from("creative_version_slides")
    .insert(assets!.map((a, i) => ({ creative_version_id: version!.id, position: i + 1, asset_id: a.id })));
  return version!.id as string;
}

test("a carousel gets a slide count, and Text on Image one field per slide", async ({ page, frank }) => {
  test.setTimeout(60_000);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await page.click('button:has-text("New Post")');
  await page.fill("#nbName", "Carousel Brief E2E");
  await page.fill("#nbDate", "2027-03-12");

  // Not a carousel: no Slides. Text on Image isn't on the Brief any more.
  await expect(page.locator("#nbSlides")).toHaveCount(0);
  await expect(page.locator(".brow textarea")).toHaveCount(0);

  await page.click("#nbFmt");
  const pop = page.getByRole("dialog", { name: "Formats" });
  await pop.getByRole("checkbox", { name: "Instagram Carousel" }).click();
  await pop.getByRole("checkbox", { name: "Instagram Feed" }).click();
  await page.keyboard.press("Escape");
  // 2 to 20 for Instagram…
  await expect(page.locator("#nbSlides option")).toHaveCount(19);
  await page.selectOption("#nbSlides", "3");

  // …held to 10 once Meta Carousel Ad is in the mix.
  await page.click("#nbFmt");
  await pop.getByRole("checkbox", { name: "Meta Carousel Ad" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#nbSlides option")).toHaveCount(9);

  await page.click('button:has-text("Create Post")');
  await expect(page.getByRole("tab", { name: "Content" })).toBeEnabled();
  const { data: c } = await admin
    .from("creatives")
    .select("id, slide_count, formats")
    .eq("project_id", frank.projectId)
    .eq("name", "Carousel Brief E2E")
    .single();
  expect(c!.slide_count).toBe(3);
  expect(c!.formats).toEqual(["ig_carousel", "meta_carousel"]);
  // No copy written yet, so no copy version (direct instruction).
  expect((await admin.from("copy_versions").select("id").eq("creative_id", c!.id)).data).toEqual([]);

  // Text on Image is its own section after the artwork on Content.
  await page.getByRole("tab", { name: "Content" }).click();
  await expect(page.locator(".brow textarea")).toHaveCount(3);
  // Slide 2 written, slide 1 left blank: positions are kept.
  await page.locator(".brow textarea").nth(1).fill("Second slide words");
  // Its own Save: on the post, never a copy version (phase57).
  await page.getByRole("button", { name: "Save Text on Image" }).click();
  await expect(page.getByRole("button", { name: "Save Text on Image" })).toBeDisabled();
  const { data: saved } = await admin.from("creatives").select("slide_text").eq("id", c!.id).single();
  expect(saved!.slide_text).toEqual(["", "Second slide words"]);
  expect((await admin.from("copy_versions").select("id").eq("creative_id", c!.id)).data).toEqual([]);
  // Saving copy without any is refused by the database too.
  const { error } = await admin.from("copy_versions").insert({ creative_id: c!.id, version_no: 1, fields: { caption: "  " }, source: "upload" });
  expect(error?.message).toContain("needs some copy");
});

test("carousel artwork is saved as a set, and replacing one slide keeps the rest", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await admin.from("creatives").update({ formats: ["ig_carousel"], slide_count: 3 }).eq("id", frank.creativeId);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: "Upload Artwork" }).click();

  await expect(page.locator(".cslot")).toHaveCount(3);
  await page
    .locator('input[aria-label="Slide files"]')
    .setInputFiles([
      await picture(page, "#0f766e", "one.png"),
      await picture(page, "#b45309", "two.png"),
      await picture(page, "#7c3aed", "three.png"),
    ]);
  await expect(page.locator(".cslot.filled")).toHaveCount(3);
  await page.getByRole("button", { name: "Save Creative V1" }).click();
  await expect(page.getByText("Saved as version 1.")).toBeVisible({ timeout: 30_000 });

  const slidesOf = async (versionNo: number) => {
    const { data } = await admin
      .from("creative_versions")
      .select("asset_id, slides:creative_version_slides(position, asset_id)")
      .eq("creative_id", frank.creativeId)
      .eq("version_no", versionNo)
      .single();
    const slides = [...(data!.slides as { position: number; asset_id: string }[])].sort((a, b) => a.position - b.position);
    return { first: data!.asset_id as string, slides };
  };
  const v1 = await slidesOf(1);
  expect(v1.slides.map((s) => s.position)).toEqual([1, 2, 3]);
  expect(v1.first).toBe(v1.slides[0].asset_id);

  // Replace slide 2 only.
  await page.locator(".cslot").nth(1).hover();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Replace slide 2" }).click();
  await (await chooser).setFiles(await picture(page, "#1d4ed8", "two-b.png"));
  await page.getByRole("button", { name: "Save Creative V2" }).click();
  await expect(page.getByText("Saved as version 2.")).toBeVisible({ timeout: 30_000 });
  const v2 = await slidesOf(2);
  expect(v2.slides[0].asset_id).toBe(v1.slides[0].asset_id);
  expect(v2.slides[1].asset_id).not.toBe(v1.slides[1].asset_id);
  expect(v2.slides[2].asset_id).toBe(v1.slides[2].asset_id);
});

test("the post page moves between slides, and pins stay on their own slide", async ({ page, frank }) => {
  test.setTimeout(60_000);
  const versionId = await seedCarousel(frank);
  // A pin on slide 2, written the way the app writes one.
  const staff = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await staff.auth.signInWithPassword({ email: frank.staffEmail, password: frank.staffPassword });
  const { data: me } = await staff.auth.getUser();
  await staff.from("comments").insert({
    creative_id: frank.creativeId,
    author_id: me.user!.id,
    body: "Pin on the second slide",
    visibility: "public",
    creative_version_id: versionId,
    anchor: { type: "pin", x: 0.5, y: 0.5, n: 1, slide: 2 },
  });

  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const media = page.locator(".ig-media");
  await expect(media.locator(".car-count")).toHaveText("1 / 3");
  // An arrow with nowhere to go is hidden.
  await expect(media.locator(".car-arrow.prev")).toBeHidden();
  await expect(media.locator("img")).toBeVisible();
  await expect(media.locator(".annot-pin")).toHaveCount(0);

  await media.getByRole("button", { name: "Next slide" }).click();
  await expect(media.locator(".car-count")).toHaveText("2 / 3");
  await expect(media.locator(".annot-pin")).toHaveCount(1);
  await media.getByRole("button", { name: "Next slide" }).click();
  await expect(media.locator(".car-count")).toHaveText("3 / 3");
  await expect(media.locator(".annot-pin")).toHaveCount(0);
  await expect(media.locator(".car-arrow.next")).toBeHidden();

  // Picking the pinned comment goes to its slide.
  await page.getByText("Pin on the second slide").click();
  await expect(media.locator(".car-count")).toHaveText("2 / 3");
});

test("the review link moves between a carousel's slides", async ({ page, frank }) => {
  await seedCarousel(frank);
  const token = await frank.createSharedLink();
  await page.goto(`${APP_URL}/review/${token}`);
  const phone = page.locator(".phone .ig-media");
  await expect(phone.locator(".car-count")).toHaveText("1 / 3", { timeout: 15_000 });
  await phone.getByRole("button", { name: "Next slide" }).click();
  await expect(phone.locator(".car-count")).toHaveText("2 / 3");
});

test("every slide can be removed and saved, leaving the post with no artwork", async ({ page, frank }) => {
  test.setTimeout(60_000);
  await seedCarousel(frank);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.locator(".cslot.filled")).toHaveCount(3);
  for (const n of [1, 2, 3]) {
    await page.locator(".cslot").nth(n - 1).hover();
    await page.getByRole("button", { name: `Remove slide ${n}` }).click();
  }
  await expect(page.locator(".cslot.filled")).toHaveCount(0);
  await page.getByRole("button", { name: "Save Creative V2" }).click();
  await expect(page.getByText("Saved as version 2.")).toBeVisible({ timeout: 30_000 });
  // V1 is still there to go back to.
  await expect(page.getByRole("tab", { name: /^V\d$/ }).first()).toHaveText("V1");

  const { data: v2 } = await admin
    .from("creative_versions")
    .select("asset_id, slides:creative_version_slides(id)")
    .eq("creative_id", frank.creativeId)
    .eq("version_no", 2)
    .single();
  expect(v2!.asset_id).toBeNull();
  expect(v2!.slides).toEqual([]);

  await page.getByRole("button", { name: "Save and Close" }).click();
  await expect(page.locator(".scrim")).toHaveCount(0);
  // Still a 3-slide carousel, now with nothing on any slide.
  await expect(page.locator(".awaiting", { hasText: "No artwork yet" })).toBeVisible();
  await expect(page.locator(".ig-media .car-count")).toHaveText("1 / 3");
  await expect(page.locator(".ig-media")).toContainText("Slide 1 has no artwork yet.");

  // The review link agrees, rather than falling back to V1.
  const token = await frank.createSharedLink();
  await page.goto(`${APP_URL}/review/${token}`);
  await expect(page.locator(".phone .ig-noart")).toContainText("No artwork yet", { timeout: 15_000 });
});

test("a signed-in client sees every slide, not just the first", async ({ page, frank }) => {
  await seedCarousel(frank);
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await client.auth.signInWithPassword({ email: frank.clientEmail, password: frank.clientPassword });
  const { data } = await client
    .from("creative_versions")
    .select("slides:creative_version_slides(position, asset:assets(id))")
    .eq("creative_id", frank.creativeId)
    .single();
  expect((data!.slides as { asset: unknown }[]).every((s) => s.asset)).toBe(true);

  await frank.loginAsClient(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const media = page.locator(".ig-media");
  await expect(media.locator(".car-count")).toHaveText("1 / 3");
  await media.getByRole("button", { name: "Next slide" }).click();
  await expect(media.locator(".car-count")).toHaveText("2 / 3");
  await expect(media.locator("img")).toBeVisible();
});

test("an empty slide still counts: arrows show, and it says it has no artwork yet", async ({ page, frank }) => {
  const versionId = await seedCarousel(frank);
  // Keep only slide 2 of a 2-slide carousel (the case found on live).
  await admin.from("creatives").update({ slide_count: 2 }).eq("id", frank.creativeId);
  await admin.from("creative_version_slides").delete().eq("creative_version_id", versionId).neq("position", 2);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const media = page.locator(".ig-media");
  await expect(media.locator(".car-count")).toHaveText("1 / 2");
  await expect(media).toContainText("Slide 1 has no artwork yet.");
  await media.getByRole("button", { name: "Next slide" }).click();
  await expect(media.locator(".car-count")).toHaveText("2 / 2");
  await expect(media.locator("img")).toBeVisible();

  const token = await frank.createSharedLink();
  await page.goto(`${APP_URL}/review/${token}`);
  const phone = page.locator(".phone .ig-media");
  await expect(phone.locator(".car-count")).toHaveText("1 / 2", { timeout: 15_000 });
  await expect(phone).toContainText("Slide 1 has no artwork yet.");
});

test("extra images fill earlier empty slides, and any that don't fit are named", async ({ page, frank }) => {
  await admin.from("creatives").update({ formats: ["ig_carousel"], slide_count: 2 }).eq("id", frank.creativeId);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: "Upload Artwork" }).click();

  // Two images picked from slide 2: one there, the other back into slide 1.
  let chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add slide 2" }).click();
  await (await chooser).setFiles([await picture(page, "#0f766e", "a.png"), await picture(page, "#b45309", "b.png")]);
  await expect(page.locator(".cslot.filled")).toHaveCount(2);

  // Three images onto a full 2-slide carousel: two placed, one named as left out.
  await page.getByRole("button", { name: "Discard Changes" }).click();
  chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add slide 1" }).click();
  await (await chooser).setFiles([
    await picture(page, "#0f766e", "a.png"),
    await picture(page, "#b45309", "b.png"),
    await picture(page, "#7c3aed", "c.png"),
  ]);
  await expect(page.locator(".cslot.filled")).toHaveCount(2);
  await expect(page.getByText("This carousel has 2 slides, so 1 file wasn't added.")).toBeVisible();
});

test("a format change the artwork no longer fits warns, and confirming removes all of it", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const versionId = await seedCarousel(frank);
  // A pin with a reply on the artwork, written the way the app writes them.
  const staff = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await staff.auth.signInWithPassword({ email: frank.staffEmail, password: frank.staffPassword });
  const { data: me } = await staff.auth.getUser();
  const { data: pin } = await staff
    .from("comments")
    .insert({
      creative_id: frank.creativeId,
      author_id: me.user!.id,
      body: "Pin on slide one",
      visibility: "public",
      creative_version_id: versionId,
      anchor: { type: "pin", x: 0.5, y: 0.5, n: 1, slide: 1 },
    })
    .select("id")
    .single();
  await staff.from("comments").insert({
    creative_id: frank.creativeId,
    author_id: me.user!.id,
    body: "A reply to the pin",
    visibility: "public",
    parent_id: pin!.id,
  });
  const { data: before } = await admin.from("assets").select("id, storage_key").eq("agency_id", frank.agencyId);

  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("tab", { name: "Brief" }).click();

  // A change that still fits saves without asking: more slides.
  await page.selectOption("#nbSlides", "4");
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await expect(page.getByText("Post updated.")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Remove uploaded creatives?" })).toHaveCount(0);

  // Carousel to Reel.
  await page.click("#nbFmt");
  const pop = page.getByRole("dialog", { name: "Formats" });
  await pop.getByRole("checkbox", { name: "Instagram Reel" }).click();
  await pop.getByRole("checkbox", { name: "Instagram Carousel" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Update", exact: true }).click();
  const warning = page.getByRole("dialog", { name: "Remove uploaded creatives?" });
  await expect(warning).toContainText("E2E, changing the format will remove all uploaded creatives");
  await expect(warning).toContainText("Instagram Carousel is a carousel and Instagram Reel is a single piece.");
  await expect(warning).toContainText("Instagram Carousel is an image and Instagram Reel is a video.");
  await expect(warning).toContainText("Instagram Carousel is 4:5 and Instagram Reel is 9:16.");

  // Cancel changes nothing.
  await warning.getByRole("button", { name: "Cancel" }).click();
  const { data: still } = await admin.from("creatives").select("formats").eq("id", frank.creativeId).single();
  expect(still!.formats).toEqual(["ig_carousel"]);
  expect((await admin.from("creative_versions").select("id").eq("creative_id", frank.creativeId)).data).toHaveLength(1);

  // Confirm removes the artwork, then saves the format.
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await warning.getByRole("button", { name: "Change Format and Remove" }).click();
  await expect(warning).toHaveCount(0);
  await expect(page.getByText("Post updated.")).toBeVisible();
  await expect
    .poll(async () => (await admin.from("creatives").select("formats").eq("id", frank.creativeId).single()).data!.formats)
    .toEqual(["ig_reel"]);
  expect((await admin.from("creative_versions").select("id").eq("creative_id", frank.creativeId)).data).toEqual([]);
  expect((await admin.from("comments").select("id").eq("creative_id", frank.creativeId).in("body", ["Pin on slide one", "A reply to the pin"])).data).toEqual([]);
  const { data: after } = await admin.from("assets").select("id").in("id", before!.map((a) => a.id));
  expect(after).toEqual([]);
  const { data: files } = await admin.storage.from("assets").list(`${frank.agencyId}/${frank.creativeId}`);
  expect((files ?? []).filter((f) => f.name.startsWith("seed-slide-"))).toEqual([]);

  // The Content tab is back to an empty upload.
  await page.getByRole("tab", { name: "Content" }).click();
  await expect(page.getByRole("button", { name: "Add the artwork" })).toBeVisible();
});

test("the database refuses to remove artwork for a client", async ({ frank }) => {
  await seedCarousel(frank);
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await client.auth.signInWithPassword({ email: frank.clientEmail, password: frank.clientPassword });
  const { error } = await client.rpc("delete_creative_artwork", { p_creative_id: frank.creativeId });
  expect(error?.message).toContain("not permitted");
  expect((await admin.from("creative_versions").select("id").eq("creative_id", frank.creativeId)).data).toHaveLength(1);
});

test("a carousel with nothing uploaded still moves between its empty slides", async ({ page, frank }) => {
  await admin.from("creatives").update({ formats: ["ig_carousel"], slide_count: 2 }).eq("id", frank.creativeId);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const media = page.locator(".ig-media");
  await expect(media.locator(".car-count")).toHaveText("1 / 2");
  await expect(media).toContainText("Slide 1 has no artwork yet.");
  await media.getByRole("button", { name: "Next slide" }).click();
  await expect(media.locator(".car-count")).toHaveText("2 / 2");
  await expect(media).toContainText("Slide 2 has no artwork yet.");

  const token = await frank.createSharedLink();
  await page.goto(`${APP_URL}/review/${token}`);
  const phone = page.locator(".phone .ig-media");
  await expect(phone.locator(".car-count")).toHaveText("1 / 2", { timeout: 15_000 });
  await phone.getByRole("button", { name: "Next slide" }).click();
  await expect(phone.locator(".car-count")).toHaveText("2 / 2");
  await expect(phone).toContainText("Slide 2 has no artwork yet.");
});
