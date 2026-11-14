import { createClient } from "@supabase/supabase-js";
import { test, expect, goToMonth } from "./fixtures";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// A post's artwork named for its formats on its buttons (direct
// instruction): Upload Video, Creative or Creatives on the post, Add the
// same in the table, and a filled cell's Update says what it updates.
test("the artwork's buttons say Video, Creative or Creatives, and a filled cell's says Update", async ({ page, frank }) => {
  test.setTimeout(120_000);
  await frank.loginAsStaff(page);
  const upload = page.locator(".ig-noart").getByRole("button", { name: /^Upload / });
  const show = async (fields: Record<string, unknown>, expected: string) => {
    await admin.from("creatives").update(fields).eq("id", frank.creativeId);
    await page.goto(`/creatives/${frank.creativeId}`);
    await expect(upload).toHaveText(expected, { timeout: 20_000 });
  };
  await show({ format: "ig_feed", formats: ["ig_feed"], slide_count: null, slide_text: ["Hello"] }, "Upload Creative");
  await show({ format: "ig_reel", formats: ["ig_reel"] }, "Upload Video");
  await show({ format: "ig_carousel", formats: ["ig_carousel"], slide_count: 3, slide_text: ["One", "Two", "Three"] }, "Upload Creatives");

  // The table: Add Video for a Reel's missing artwork, Update Text on Image
  // beside its words.
  await admin.from("creatives").update({ format: "ig_reel", formats: ["ig_reel"], slide_count: null, slide_text: ["On screen"] }).eq("id", frank.creativeId);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty", { timeout: 60_000 });
  await goToMonth(page, "March 2027");
  const row = page.locator("tr[data-row]", { hasText: "E2E Test Creative" });
  await expect(row.locator(".tpending-btn", { hasText: "Add Video" })).toBeVisible({ timeout: 15_000 });
  await expect(row.locator(".tedit-btn", { hasText: "Update Text on Image" })).toBeVisible();
});
