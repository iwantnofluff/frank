import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";

// The previous and next post either side of the phone on a post's page
// (direct instruction): its date, title and format, in the planner's date
// order, archived posts left out.
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

test("a post's page names the previous and next post beside the phone, and opens them", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const day = 86_400_000;
  const own = Date.parse((await admin.from("creatives").select("scheduled_at").eq("id", frank.creativeId).single()).data!.scheduled_at as string);
  const at = async (name: string, offsetDays: number, archived = false) => {
    const id = await frank.createCreativeAtStage(2, name);
    const { error } = await admin
      .from("creatives")
      .update({ scheduled_at: new Date(own + offsetDays * day).toISOString(), archived_at: archived ? new Date().toISOString() : null })
      .eq("id", id);
    if (error) throw error;
    return id;
  };
  await at("Two Days Before", -2);
  await at("Archived Just Before", -1, true);
  const after = await at("Three Days After", 3);
  await at("A Week After", 7);

  await frank.loginAsStaff(page);
  await page.setViewportSize({ width: 1728, height: 1000 });
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const prev = page.locator(".pnav.prev");
  const next = page.locator(".pnav.next");
  await expect(prev.locator("b")).toHaveText("Two Days Before");
  await expect(prev.locator(".pnav-fmt")).toHaveText("Instagram Feed");
  await expect(next.locator("b")).toHaveText("Three Days After");
  const expected = new Date(own + 3 * day).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" });
  await expect(next.locator(".pnav-date")).toHaveText(expected);
  // The current post's date, title and format above the phone.
  await expect(page.locator(".pnav-cur b")).toHaveText("E2E Test Creative");
  await expect(page.locator(".pnav-cur .pnav-fmt")).toHaveText("Instagram Feed");

  // The arrow steps to the next post...
  await next.locator(".pnav-arrow").click();
  await page.waitForURL(`**/creatives/${after}`);
  await expect(prev.locator("b")).toHaveText("E2E Test Creative");
  await expect(next.locator("b")).toHaveText("A Week After");
  await expect(page.locator(".pnav-cur b")).toHaveText("Three Days After");
  // ...and the post's details open it too.
  await next.locator(".pnav-d").click();
  await page.waitForURL((u) => !u.pathname.endsWith(after));
  await expect(prev.locator("b")).toHaveText("Three Days After");
  // The last post: nothing after it, the phone still centred.
  await expect(page.locator(".pnav.next.none")).toHaveCount(1);
});
