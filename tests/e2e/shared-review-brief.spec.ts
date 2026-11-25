import { createClient } from "@supabase/supabase-js";
import { test, expect, PHONE_VIEWPORT } from "./fixtures";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// The post's brief on the review link (direct instruction), as a signed-in
// Client reads it: Notes for Designer stay the team's.
async function seedBrief(frank: { creativeId: string; agencyId: string }) {
  const { data: staff } = await admin.from("memberships").select("user_id").eq("agency_id", frank.agencyId).is("client_id", null).limit(1);
  const { data } = await admin
    .from("creatives")
    .update({ concept: "A warm smile, morning light.", reference_urls: ["https://example.com/ref"], team_user_ids: [staff![0].user_id] })
    .eq("id", frank.creativeId)
    .select("id");
  expect(data?.length).toBe(1);
}

test("review link — Brief sits before Content and shows the post's brief", async ({ page, frank }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedBrief(frank);
  const token = await frank.createSharedLink();
  await page.goto(`/review/${token}`);
  await expect(page.locator(".dk-nav button:has(.rn-ic)")).toHaveText(["Brief", "Content", "Feed"]);
  await page.locator(".dk-nav").getByRole("button", { name: "Brief" }).click();
  const brief = page.locator(".dk-brief");
  await expect(brief).toContainText("A warm smile, morning light.");
  await expect(brief.getByRole("link", { name: "https://example.com/ref" })).toBeVisible();
  await expect(brief).toContainText("E2E Staff");
  await expect(brief).not.toContainText("Notes for Designer");
});

test("review link — on a phone, Brief is the first icon", async ({ page, frank }) => {
  await page.setViewportSize(PHONE_VIEWPORT);
  await seedBrief(frank);
  const token = await frank.createSharedLink();
  await page.goto(`/review/${token}`);
  await expect(page.locator(".m-view")).toHaveCount(3);
  await expect(page.locator(".m-view").first()).toHaveAttribute("aria-label", "Brief");
  await page.getByRole("button", { name: "Brief" }).click();
  await expect(page.getByRole("button", { name: "Brief" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".m-brief")).toContainText("A warm smile, morning light.");
  const box = await page.locator(".m-brief .brief").boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE_VIEWPORT.width);
});
