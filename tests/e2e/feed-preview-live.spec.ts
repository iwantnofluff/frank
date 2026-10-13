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
  await dated("Late In Review", 2, -2);

  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: "Feed", exact: true }).click();
  const tile = (name: string) => page.locator(".feedgrid-tile", { hasText: name });
  await expect(tile("Went Live Yesterday").locator(".stagepill")).toHaveText("Live");
  await expect(tile("Approved For Next Week").locator(".stagepill")).toContainText("Approved");
  await expect(tile("Still In Review").locator(".pp-empty-date")).not.toBeEmpty();
  // Past its date and not live: the date in bold red (direct instruction).
  await expect(tile("Late In Review").locator(".pp-empty-date")).toHaveClass(/overdue/);
  await expect(tile("Still In Review").locator(".pp-empty-date")).not.toHaveClass(/overdue/);
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
  await page.getByRole("button", { name: "Feed", exact: true }).click();
  await expect(tile("Approved For Next Week")).toBeVisible();
  await expect(tile("Went Live Yesterday")).toHaveCount(0);

  // Looking at a post that has itself gone live: its own tile goes too
  // (direct instruction: it showed beside the real one).
  await admin.from("creatives").update({ stage: 4, scheduled_at: new Date(Date.now() - day).toISOString() }).eq("id", frank.creativeId);
  await page.reload();
  await page.getByRole("button", { name: "Feed", exact: true }).click();
  await expect(tile("Approved For Next Week")).toBeVisible();
  await expect(tile("E2E Test Creative")).toHaveCount(0);
});

test("the Feed Preview and a review link's Feed put the newest post first, as Instagram does (phase93)", async ({ page, frank }) => {
  const own = Date.parse((await admin.from("creatives").select("scheduled_at").eq("id", frank.creativeId).single()).data!.scheduled_at as string);
  // Made in this order (the planner's), dated out of it.
  for (const [name, days] of [["Plus Five", 5], ["Plus One", 1], ["Plus Nine", 9]] as const) {
    const id = await frank.createCreativeAtStage(3, name);
    const { error } = await admin.from("creatives").update({ scheduled_at: new Date(own + days * day).toISOString() }).eq("id", id);
    if (error) throw error;
  }
  const newestFirst = ["Plus Nine", "Plus Five", "Plus One", "E2E Test Creative"];

  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: "Feed", exact: true }).click();
  await expect(page.locator(".feedgrid-tile .pp-empty b")).toHaveText(newestFirst);

  const token = await frank.createSharedLink();
  const body = await (await page.request.post(`${APP_URL}/api/shared-review`, { data: { token } })).json();
  const names = new Map((body.creatives as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  expect((body.feed as { id: string | null }[]).map((e) => (e.id ? names.get(e.id) : null))).toEqual(newestFirst);
});
