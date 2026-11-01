import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { test, expect, APP_URL, type Frank } from "./fixtures";

// From a post's page (direct instruction): its project's name above the
// sections goes back to the table on that post's row, brought into view
// and lit, on a computer and a phone; and the phone full size over the
// page, for a video too small on a laptop.
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Next month: ten posts on the 1st to the 10th, then the fixture's post on
// the 28th, below them all.
async function seedMonth(frank: Frank) {
  const d = new Date();
  for (let i = 1; i <= 10; i++) {
    const id = await frank.createCreativeAtStage(2, `Earlier In The Month ${i}`);
    await admin.from("creatives").update({ scheduled_at: new Date(d.getFullYear(), d.getMonth() + 1, i, 10).toISOString() }).eq("id", id);
  }
  const when = new Date(d.getFullYear(), d.getMonth() + 1, 28, 10);
  await admin.from("creatives").update({ scheduled_at: when.toISOString() }).eq("id", frank.creativeId);
  return when;
}

test("the project's name on a post's page goes back to the table on its row, on a computer and a phone", async ({ page, frank }) => {
  test.setTimeout(120_000);
  const when = await seedMonth(frank);
  await page.setViewportSize({ width: 1440, height: 700 });
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await page.getByRole("link", { name: "E2E Test Project" }).filter({ has: page.locator("svg") }).click();
  await page.waitForURL(`**/projects/${frank.projectId}`);
  // Next month, not this one, and the row in view without scrolling, lit.
  await expect(page.locator(".calmonth")).toHaveText(`${when.toLocaleString("en", { month: "long" })} ${when.getFullYear()}`);
  const row = page.locator(`tr[data-post="${frank.creativeId}"]`);
  await expect(row).toBeInViewport({ timeout: 10_000 });
  await expect(row).toHaveClass(/rowflash/);
  // The address loses ?post=, so a reload doesn't do it again.
  expect(new URL(page.url()).search).toBe("");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await page.locator(".mpost-back").click();
  await page.waitForURL(`**/projects/${frank.projectId}`);
  await expect(page.locator(".mproj-month b")).toHaveText(`${when.toLocaleString("en", { month: "short" })} ${when.getFullYear()}`);
  await expect(page.locator(`.mproj-card[data-post="${frank.creativeId}"]`)).toBeInViewport({ timeout: 10_000 });
});

// A 3-slide carousel with real files, so its count shows.
async function seedCarousel(page: Page, frank: Frank) {
  await admin.from("creatives").update({ formats: ["ig_carousel"], slide_count: 3 }).eq("id", frank.creativeId);
  const { data: staffUser } = await admin.from("users").select("id").eq("email", frank.staffEmail).single();
  await page.setViewportSize({ width: 400, height: 500 });
  const ids: string[] = [];
  for (const [n, colour] of [[1, "#e33"], [2, "#3a3"], [3, "#33e"]] as const) {
    const key = `${frank.agencyId}/${frank.creativeId}/expand-slide-${n}.png`;
    await page.setContent(`<body style="margin:0;background:${colour}"></body>`);
    await admin.storage.from("assets").upload(key, await page.screenshot(), { contentType: "image/png" });
    const { data: a } = await admin
      .from("assets")
      .insert({ agency_id: frank.agencyId, storage_key: key, filename: `s${n}.png`, mime_type: "image/png", bytes: 1, created_by: staffUser!.id })
      .select("id")
      .single();
    ids.push(a!.id);
  }
  const { data: v } = await admin
    .from("creative_versions")
    .insert({ creative_id: frank.creativeId, version_no: 1, asset_id: ids[0], created_by: staffUser!.id })
    .select("id")
    .single();
  await admin.from("creative_version_slides").insert(ids.map((a, i) => ({ creative_version_id: v!.id, position: i + 1, asset_id: a })));
}

test("the phone opens full size over the page, on the same slide, and closes with Esc, its button or the backdrop", async ({ page, frank }) => {
  test.setTimeout(120_000);
  await seedCarousel(page, frank);
  await page.setViewportSize({ width: 1440, height: 820 });
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const frame = page.locator(".phoneframe");
  const count = page.locator(".phoneframe .car-count");
  await expect(count).toBeVisible({ timeout: 20_000 });
  await page.locator(".phoneframe .car-arrow.next").click();
  await expect(count).toHaveText(/^2\s*\/\s*3$/);
  const small = (await frame.boundingBox())!.height;

  // On the right under Copy: square, as tall as the version pickers.
  const open = page.getByRole("button", { name: "See the phone full size" });
  const b = (await open.boundingBox())!;
  const copy = (await page.locator("#vCopy").boundingBox())!;
  expect(b.height).toBe(copy.height);
  expect(b.width).toBe(b.height);
  expect(b.y).toBeGreaterThan(copy.y);
  await expect(page.locator(".vsel", { has: open })).toContainText("Expand");
  await open.click();
  const dialog = page.getByRole("dialog", { name: "The post full size" });
  await expect(dialog).toBeVisible();
  // As tall as the window allows: half as big again here, within the window.
  await expect.poll(async () => (await frame.boundingBox())!.height).toBeGreaterThan(small * 1.4);
  const big = (await frame.boundingBox())!;
  expect(big.y).toBeGreaterThanOrEqual(0);
  expect(big.y + big.height).toBeLessThanOrEqual(820);
  // The same phone: still on slide 2, and it still steps.
  await expect(count).toHaveText(/^2\s*\/\s*3$/);
  await page.locator(".phoneframe .car-arrow.next").click();
  await expect(count).toHaveText(/^3\s*\/\s*3$/);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => (await frame.boundingBox())!.height).toBeCloseTo(small, 0);
  await open.click();
  await page.getByRole("button", { name: "Close the full-size view" }).click();
  await expect(dialog).toHaveCount(0);
  await open.click();
  await page.mouse.click(40, 410);
  await expect(dialog).toHaveCount(0);
});
