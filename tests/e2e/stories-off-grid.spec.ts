import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";

// Direct instruction: Stories are never on the feed, so they never appear
// in its grid, on the post page or a review link (phase164). A post made
// for a feed and a Story is on it; a Story is still there to review.
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

test("a Story isn't in the grid; a post for the feed and a Story is", async ({ page, browser, frank }) => {
  test.setTimeout(90_000);
  const make = async (name: string, formats: string[]) => {
    const id = await frank.createCreativeAtStage(4, name);
    const { error } = await admin
      .from("creatives")
      .update({ format: formats[0], formats, scheduled_at: new Date(Date.now() + 2 * 86_400_000).toISOString() })
      .eq("id", id);
    if (error) throw error;
    return id;
  };
  const story = await make("Story Only", ["ig_story"]);
  await make("Feed And Story", ["ig_feed", "ig_story"]);
  await make("WhatsApp Only", ["wa_status"]);

  // The post page's grid, opened from the Story itself: not even it.
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${story}`);
  await page.getByRole("button", { name: "Feed", exact: true }).click();
  const tile = (name: string) => page.locator(".feedgrid-tile", { hasText: name });
  await expect(tile("Feed And Story")).toBeVisible({ timeout: 20_000 });
  await expect(tile("Story Only")).toHaveCount(0);
  await expect(tile("WhatsApp Only")).toHaveCount(0);

  // A review link to the whole project: the Story to review, not in the grid.
  const token = await frank.createSharedLink();
  const guest = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await guest.goto(`${APP_URL}/review/${token}`);
  await expect(guest.locator(".dk-item", { hasText: "Story Only" })).toBeVisible({ timeout: 20_000 });
  await guest.getByRole("button", { name: "Feed", exact: true }).click();
  const shared = (name: string) => guest.locator(".sharedfeed-planned", { hasText: name });
  await expect(shared("Feed And Story")).toBeVisible({ timeout: 20_000 });
  await expect(shared("Story Only")).toHaveCount(0);
  await expect(shared("WhatsApp Only")).toHaveCount(0);
});
