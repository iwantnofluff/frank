import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";

// The Feed Preview (direct instruction): every planned tile has its date,
// artwork or not; a post that's gone live (Approved, its date passed) is
// marked Live, and once the client's Instagram is connected it isn't shown
// twice, the real post standing for it.
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const day = 86_400_000;

test("Feed Preview dates every tile, marks live posts, and doesn't show them twice once connected", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const dated = async (name: string, stage: number, offsetDays: number) => {
    const id = await frank.createCreativeAtStage(stage, name);
    const { error } = await admin.from("creatives").update({ scheduled_at: new Date(Date.now() + offsetDays * day).toISOString() }).eq("id", id);
    if (error) throw error;
  };
  await dated("Went Live Yesterday", 4, -1);
  await dated("Approved For Next Week", 4, 7);
  await dated("Still In Review", 2, 3);

  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: "Feed Preview" }).click();
  const tile = (name: string) => page.locator(".feedgrid-tile", { hasText: name });
  await expect(tile("Went Live Yesterday").locator(".stagepill")).toHaveText("Live");
  await expect(tile("Approved For Next Week").locator(".stagepill")).toContainText("Approved");
  await expect(tile("Still In Review").locator(".pp-empty-date")).not.toBeEmpty();
  await expect(tile("Went Live Yesterday")).not.toHaveClass(/not-live/);

  // Connected: the client's feed answers with its real post.
  await page.route(`**/api/clients/${frank.clientId}/instagram*`, (r) =>
    r.fulfill({
      json: {
        status: "ok",
        feed: {
          profile: { username: "e2e", name: "E2E", pictureUrl: null, followers: 1, following: 1, posts: 1, bio: null, website: null },
          posts: [{ id: "p1", imageUrl: null, permalink: "https://instagram.com/p/x", caption: "The real one", kind: "IMAGE", reel: false, videoUrl: null, carousel: false, at: new Date(Date.now() - day).toISOString() }],
          next: null,
        },
      },
    }),
  );
  await page.reload();
  await page.getByRole("button", { name: "Feed Preview" }).click();
  await expect(tile("Approved For Next Week")).toBeVisible();
  await expect(tile("Went Live Yesterday")).toHaveCount(0);
});
