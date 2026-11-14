import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { test, expect, APP_URL } from "./fixtures";

// The comments' own box (direct instruction: picked words go there, with
// no small box of their own).
const mainBox = (page: Page) => page.locator("aside.cmts > .composer");

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Selects `words` in the Text on Image shown where the artwork goes, as a
// person dragging over them would, which takes them to the comment box.
async function selectWords(page: Page, words: string, where = ".noart-toi .hl-target") {
  await page.locator(where).first().evaluate((el, w) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const at = (node.textContent ?? "").indexOf(w);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + w.length);
      const sel = window.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      return;
    }
    throw new Error(`"${w}" not found`);
  }, words);
}

// Until a post has artwork, its Text on Image shows where the artwork goes
// (direct instruction), and the team and a signed-in client comment on its
// words as on a caption's. The review link shows it, read only.
test("Text on Image shows where the artwork goes, and its words take comments", async ({ page, browser, frank }) => {
  test.setTimeout(150_000);
  await admin.from("creatives").update({ slide_text: ["Big sale, 50% off this weekend"] }).eq("id", frank.creativeId);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const box = page.locator(".noart-toi");
  await expect(box).toContainText("Big sale, 50% off this weekend", { timeout: 20_000 });
  await expect(page.locator(".ig-noart").getByRole("button", { name: /^Upload (Video|Creative|Creatives)$/ })).toBeVisible();

  // A person's drag selects its words, though the artwork area around them
  // can't be selected (.ig-media), and takes them to the comment box, even
  // let go past the last word.
  await expect(async () => {
    const b = (await box.boundingBox())!;
    await page.mouse.move(b.x + 1, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width + 6, b.y + b.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(mainBox(page).locator(".cdraft")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await mainBox(page).getByRole("button", { name: "Remove it" }).click();
  await expect(mainBox(page).locator(".cdraft")).toHaveCount(0);

  // Again until it's in the comment box: a selection made before the page
  // is ready to take it does nothing. The box is ready to type in, the
  // words marked meanwhile.
  await expect(async () => {
    await selectWords(page, "50% off");
    await expect(mainBox(page).locator(".cdraft")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  const composer = mainBox(page);
  await expect(composer.locator(".cdraft .hl-a")).toHaveText("Text on Image: “50% off”");
  await expect(composer.locator("textarea")).toBeFocused();
  await expect(box.locator(".hl-mark.act")).toHaveText("50% off");
  await page.keyboard.type("Make it 40%");
  await composer.getByRole("button", { name: "Post" }).click();
  await expect(composer.locator(".cdraft")).toHaveCount(0);
  const card = page.locator(".cmt", { hasText: "Make it 40%" });
  await expect(card).toBeVisible();
  await expect(card.locator(".hl-a")).toHaveText("Text on Image: “50% off”");
  await expect(box.locator(".hl-mark")).toHaveText("50% off");
  await expect
    .poll(async () => (await admin.from("comments").select("anchor").eq("creative_id", frank.creativeId).eq("body", "Make it 40%").maybeSingle()).data?.anchor, { timeout: 10_000 })
    .toMatchObject({ type: "highlight", field: "slide_text", quote: "50% off" });

  // A client on the post page, signed in: the same.
  const clientPage = await (await browser.newContext()).newPage();
  await frank.loginAsClient(clientPage);
  await clientPage.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await expect(clientPage.locator(".noart-toi")).toContainText("Big sale", { timeout: 20_000 });
  // Again until it's in the comment box: a selection made before the page
  // is ready to take it does nothing.
  await expect(async () => {
    await selectWords(clientPage, "this weekend");
    await expect(mainBox(clientPage).locator(".cdraft")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await mainBox(clientPage).locator("textarea").fill("Which weekend?");
  await mainBox(clientPage).getByRole("button", { name: "Post" }).click();
  await expect(clientPage.locator(".cmt", { hasText: "Which weekend?" }).locator(".hl-a")).toHaveText("Text on Image: “this weekend”");

  // The review link: the words, read only.
  const token = await frank.createSharedLink();
  await page.goto(`${APP_URL}/review/${token}`);
  await expect(page.locator(".dk-card .noart-toi")).toContainText("Big sale, 50% off this weekend", { timeout: 20_000 });
  await expect(page.locator(".dk-card .noart-toi .hl-target")).toHaveCount(0);
});

// On a carousel, a comment on a slide's Text on Image is on that slide:
// picking it from another slide moves the post to it (direct instruction),
// as a pin's does.
test("picking a Text on Image comment moves to its slide", async ({ page, frank }) => {
  test.setTimeout(150_000);
  await admin
    .from("creatives")
    .update({ format: "ig_carousel", formats: ["ig_carousel"], slide_count: 3, slide_text: ["First slide words", "Second slide words", "Third slide nuance here"] })
    .eq("id", frank.creativeId);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const media = page.locator(".ig-media");
  const box = page.locator(".noart-toi");
  await expect(box).toContainText("First slide words", { timeout: 20_000 });
  await media.getByRole("button", { name: "Next slide" }).click();
  await media.getByRole("button", { name: "Next slide" }).click();
  await expect(media.locator(".car-count")).toHaveText("3 / 3");
  await expect(box).toContainText("Third slide nuance here");
  await expect(async () => {
    await selectWords(page, "nuance");
    await expect(mainBox(page).locator(".cdraft")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await mainBox(page).locator("textarea").fill("Hello");
  await mainBox(page).getByRole("button", { name: "Post" }).click();
  const card = page.locator(".cmt", { hasText: "Hello" });
  await expect(card.locator(".hl-a")).toHaveText("Text on Image, Slide 3: “nuance”");

  // Back to the first slide, then the comment: the post moves to slide 3,
  // its words marked.
  await media.getByRole("button", { name: "Previous slide" }).click();
  await media.getByRole("button", { name: "Previous slide" }).click();
  await expect(media.locator(".car-count")).toHaveText("1 / 3");
  await card.locator(".hl-a").click();
  await expect(media.locator(".car-count")).toHaveText("3 / 3");
  await expect(box.locator(".hl-mark")).toHaveText("nuance");
});

// References sit under Notes for Designer (direct instruction): in the post
// window with their own save, and in the table's Notes for Designer column
// for the team; the column once Concept & Reference is just Concept. A
// client still reads them, under the Concept.
test("References sit under Notes for Designer, and a client still reads them", async ({ page, browser, frank }) => {
  test.setTimeout(150_000);
  await admin.from("creatives").update({ concept: "Autumn oats", reference_urls: [] }).eq("id", frank.creativeId);
  await frank.loginAsStaff(page);
  await page.setViewportSize({ width: 2400, height: 900 });
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await expect(async () => {
    await page.getByRole("button", { name: "Edit", exact: true }).first().click();
    await expect(page.getByRole("tab", { name: "Brief" })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await page.getByRole("tab", { name: "Brief" }).click();
  // After the Design heading, not under Concept.
  const order = await page.locator(".msection-h, label[for='nbRef'], label[for='nbConcept'], label[for='nbNotes']").allTextContents();
  const at = (t: string) => order.findIndex((x) => x.startsWith(t));
  expect(at("References")).toBeGreaterThan(at("Design"));
  expect(at("References")).toBeGreaterThan(at("Notes for Designer"));
  await expect(page.getByRole("button", { name: "Save Concept", exact: true })).toBeVisible();
  await page.getByLabel("Reference 1").fill("https://example.com/look");
  await page.getByRole("button", { name: "Save References" }).click();
  await expect
    .poll(async () => (await admin.from("creatives").select("concept, reference_urls").eq("id", frank.creativeId).single()).data)
    .toEqual({ concept: "Autumn oats", reference_urls: ["https://example.com/look"] });
  await page.keyboard.press("Escape");

  // The table: Concept, and the link under Notes for Designer.
  await admin.from("creatives").update({ scheduled_at: new Date().toISOString() }).eq("id", frank.creativeId);
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  const row = page.locator(`tr[data-post="${frank.creativeId}"]`);
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.tbl thead th[data-col-key="concept"]')).toContainText("Concept");
  await expect(page.locator('.tbl thead th[data-col-key="concept"]')).not.toContainText("Reference");
  const headers = await page.locator(".tbl thead th[data-col-key]").evaluateAll((ths) => ths.map((th) => th.getAttribute("data-col-key")));
  const cell = (key: string) => row.locator("td").nth(headers.indexOf(key) + 1);
  await expect(cell("notes")).toContainText("example.com", { timeout: 15_000 });
  await expect(cell("concept")).not.toContainText("example.com");

  // A client: no Notes column, the link under the Concept.
  const clientPage = await (await browser.newContext()).newPage();
  await clientPage.setViewportSize({ width: 2400, height: 900 });
  await frank.loginAsClient(clientPage);
  await clientPage.goto(`${APP_URL}/projects/${frank.projectId}`);
  const crow = clientPage.locator(`tr[data-post="${frank.creativeId}"]`);
  await expect(crow).toBeVisible({ timeout: 20_000 });
  const cheaders = await clientPage.locator(".tbl thead th[data-col-key]").evaluateAll((ths) => ths.map((th) => th.getAttribute("data-col-key")));
  expect(cheaders).not.toContain("notes");
  await expect(crow.locator("td").nth(cheaders.indexOf("concept"))).toContainText("example.com");
});

// The VO script under it too (direct instruction), named once both are
// there, its words taking comments that stay Private (phase152); the team's
// only, so a client sees the Text on Image alone.
test("the VO shows under the Text on Image for the team, never for a client", async ({ page, browser, frank }) => {
  test.setTimeout(90_000);
  await admin
    .from("creatives")
    .update({ formats: ["ig_reel"], format: "ig_reel", slide_text: ["Phones down, glasses up"], voiceover: "Some nights deserve your full attention." })
    .eq("id", frank.creativeId);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const top = page.locator(".noart-top");
  await expect(top.locator(".noart-vo")).toHaveText("VOSome nights deserve your full attention.", { timeout: 20_000 });
  await expect(top.locator(".noart-lbl")).toHaveText(["Text on Image", "VO"]);

  // Its words take a comment, Private and nothing else (phase152).
  await selectWords(page, "full attention", ".noart-vo .hl-target");
  const box = mainBox(page);
  await expect(box.locator(".cdraft")).toContainText("VO: \u201cfull attention\u201d");
  await expect(box.getByText("Private (the VO is for your team only)")).toBeVisible();
  await expect(box.getByRole("checkbox", { name: "Private" })).toHaveCount(0);
  await expect(box.getByText(/On behalf of/)).toHaveCount(0);
  await box.locator("textarea").fill("Slow this line down");
  await box.getByRole("button", { name: "Post", exact: true }).click();
  const card = page.locator(".cmt:not(.pending)", { hasText: "Slow this line down" });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card.locator(".vis-tag")).toHaveText("Private");
  await expect(card.locator("button.vistoggle")).toHaveCount(0);
  await expect(page.locator(".noart-vo mark")).toHaveText("full attention");
  const { data: row } = await admin.from("comments").select("id, visibility, anchor").eq("body", "Slow this line down").single();
  expect(row!.visibility).toBe("private");
  expect((row!.anchor as { field: string }).field).toBe("voiceover");
  // And the database keeps it so.
  const made = await admin.from("comments").update({ visibility: "public" }).eq("id", row!.id).select("id");
  expect(made.error?.message).toContain("comments_vo_private");

  // The VO alone: no Text on Image, so only VO is named.
  await admin.from("creatives").update({ slide_text: [] }).eq("id", frank.creativeId);
  await page.reload();
  await expect(top.locator(".noart-lbl")).toHaveText(["VO"], { timeout: 20_000 });
  await admin.from("creatives").update({ slide_text: ["Phones down, glasses up"] }).eq("id", frank.creativeId);

  // Too long for the space: the post keeps its shape (a Reel's 9:16), and
  // the words scroll inside it (direct instruction).
  const long = Array.from({ length: 30 }, (_, i) => `Line ${i + 1} of the voiceover.`).join("\n");
  await admin.from("creatives").update({ voiceover: long }).eq("id", frank.creativeId);
  await page.reload();
  await expect(top.locator(".noart-vo")).toContainText("Line 30", { timeout: 20_000 });
  const size = await page.locator(".ig-noart.has-top").evaluate((el) => {
    const inner = el.querySelector(".noart-top")!;
    return { w: el.clientWidth, h: el.clientHeight, inner: inner.clientHeight, content: inner.scrollHeight };
  });
  expect(Math.abs(size.h - (size.w * 16) / 9)).toBeLessThan(2);
  expect(size.content).toBeGreaterThan(size.inner);
  await top.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(top.getByText("Line 30 of the voiceover.")).toBeInViewport();

  const c = await (await browser.newContext()).newPage();
  await frank.loginAsClient(c);
  await c.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await expect(c.locator(".noart-toi")).toContainText("Phones down, glasses up", { timeout: 20_000 });
  await expect(c.locator(".noart-vo, .noart-lbl")).toHaveCount(0);
  await expect(c.getByText(/of the voiceover/)).toHaveCount(0);
  // Nor its comment.
  await expect(c.getByText("Slow this line down")).toHaveCount(0);
});
