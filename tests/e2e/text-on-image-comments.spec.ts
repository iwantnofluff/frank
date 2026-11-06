import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { test, expect, APP_URL } from "./fixtures";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Selects `words` in the Text on Image shown where the artwork goes, as a
// person dragging over them would, and opens its comment box.
async function selectWords(page: Page, words: string) {
  await page.locator(".noart-toi .hl-target").evaluate((el, w) => {
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
  await expect(page.locator(".ig-noart").getByRole("button", { name: "Upload Artwork" })).toBeVisible();

  // A person's drag selects its words, though the artwork area around them
  // can't be selected (.ig-media), and opens the comment box, even let go
  // past the last word.
  await expect(async () => {
    const b = (await box.boundingBox())!;
    await page.mouse.move(b.x + 1, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width + 6, b.y + b.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(page.locator(".hl-composer")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await page.locator(".hl-composer").getByRole("button", { name: "Cancel" }).click();

  // Again until its comment box opens: a selection made before the page
  // is ready to take it does nothing.
  await expect(async () => {
    await selectWords(page, "50% off");
    await expect(page.locator(".hl-composer")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  const composer = page.locator(".hl-composer");
  await expect(composer.locator(".quoted")).toHaveText("“50% off”");
  await composer.getByPlaceholder("Comment on this text…").fill("Make it 40%");
  await composer.getByRole("button", { name: "Post" }).click();
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
  // Again until its comment box opens: a selection made before the page
  // is ready to take it does nothing.
  await expect(async () => {
    await selectWords(clientPage, "this weekend");
    await expect(clientPage.locator(".hl-composer")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await clientPage.locator(".hl-composer").getByPlaceholder("Comment on this text…").fill("Which weekend?");
  await clientPage.locator(".hl-composer").getByRole("button", { name: "Post" }).click();
  await expect(clientPage.locator(".cmt", { hasText: "Which weekend?" }).locator(".hl-a")).toHaveText("Text on Image: “this weekend”");

  // The review link: the words, read only.
  const token = await frank.createSharedLink();
  await page.goto(`${APP_URL}/review/${token}`);
  await expect(page.locator(".dk-card .noart-toi")).toContainText("Big sale, 50% off this weekend", { timeout: 20_000 });
  await expect(page.locator(".dk-card .noart-toi .hl-target")).toHaveCount(0);
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
