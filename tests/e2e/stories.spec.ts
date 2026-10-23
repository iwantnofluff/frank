import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { test, expect, APP_URL } from "./fixtures";

// Stories (direct instruction): an Instagram Story, Facebook Story or
// WhatsApp Status post has a number of stories, 1 to 20, like a
// carousel's slides; an upload and a Text on Image box for each; and no
// Copy. On the phone, several show Instagram's bars along the top.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function picture(page: Page, colour: string, name: string) {
  const b64 = await page.evaluate((c) => {
    const cv = document.createElement("canvas");
    cv.width = 360;
    cv.height = 640;
    const g = cv.getContext("2d")!;
    g.fillStyle = c;
    g.fillRect(0, 0, 360, 640);
    return cv.toDataURL("image/png").split(",")[1];
  }, colour);
  return { name, mimeType: "image/png", buffer: Buffer.from(b64, "base64") };
}

test("a story post takes a number of stories, an upload and Text on Image for each, and no Copy", async ({ page, frank }) => {
  test.setTimeout(120_000);
  await admin.from("creatives").update({ format: "ig_story", formats: ["ig_story"], slide_count: null }).eq("id", frank.creativeId);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);

  // Brief: Stories, 1 to 20, starting at 1; three chosen and saved.
  await page.locator(".btn.primary", { hasText: /^Edit$/ }).click();
  await page.getByRole("tab", { name: "Brief" }).click();
  const count = page.getByLabel(/^Stories/);
  await expect(count).toHaveValue("1");
  await expect(count.locator("option")).toHaveText(Array.from({ length: 20 }, (_, i) => String(i + 1)));
  await count.selectOption("3");
  await page.getByRole("button", { name: "Update" }).click();
  await expect.poll(async () => (await admin.from("creatives").select("slide_count").eq("id", frank.creativeId).single()).data?.slide_count).toBe(3);

  // Content: three upload slots, a Text on Image box per story, no Copy.
  await page.getByRole("tab", { name: "Content" }).click();
  // The artwork's slots (a Story is a video post, so a Thumbnail's slot is
  // there too, phase118).
  await expect(page.locator('.cslots[aria-label="Slides"] .cslot')).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Add story 2" })).toBeVisible();
  await expect(page.locator(".msection-h", { hasText: /^Copy$/ })).toHaveCount(0);
  // Text on Image, a box per story, on Production (direct instruction).
  await page.getByRole("tab", { name: "Production" }).click();
  await expect(page.locator(".msection-h", { hasText: /^Text on Image$/ })).toBeVisible();
  for (const n of [1, 2, 3]) await expect(page.getByText(`Story ${n}`, { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Content" }).click();

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
  await page.keyboard.press("Escape");
  await expect(page.locator(".modal")).toHaveCount(0);

  // On the phone: three bars, the first lit; the next story lights two.
  const bars = page.locator(".ig.story .story-bars i");
  await expect(bars).toHaveCount(3, { timeout: 15_000 });
  await expect(page.locator(".ig.story .story-bars i.on")).toHaveCount(1);
  await expect(page.locator(".ig.story .car-dots, .ig.story .car-count")).toHaveCount(0);
  await page.getByRole("button", { name: "Next story" }).click();
  await expect(page.locator(".ig.story .story-bars i.on")).toHaveCount(2);
});
