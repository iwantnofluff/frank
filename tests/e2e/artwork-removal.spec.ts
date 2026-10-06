import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL, type Frank } from "./fixtures";

// An Approved post's artwork goes 7 days after its live date; undated ones
// wait on an Owner's or Admin's decision from the bell (phase60/61). The
// daily run is called here for the test agency only (never the cron route
// with its secret, which sweeps every agency).

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();
const dateAgo = (n: number) => daysAgo(n).slice(0, 10);

async function session(email: string, password: string) {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  await c.auth.signInWithPassword({ email, password });
  return c;
}

// A post with one version of real artwork in storage, and a comment on it
// written by staff through their own session (comments are caller-checked).
async function postWithArtwork(frank: Frank, projectId: string, fields: Record<string, unknown>) {
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  const { data: post, error } = await admin
    .from("creatives")
    .insert({ project_id: projectId, format: "ig_feed", created_by: staffId, ...fields })
    .select("id")
    .single();
  if (error) throw error;
  const path = `${frank.agencyId}/${post.id}/${crypto.randomUUID()}-art.png`;
  const up = await admin.storage.from("assets").upload(path, PNG, { contentType: "image/png" });
  if (up.error) throw up.error;
  const { data: asset, error: assetError } = await admin
    .from("assets")
    .insert({ agency_id: frank.agencyId, storage_key: path, filename: "art.png", mime_type: "image/png", bytes: PNG.length, created_by: staffId })
    .select("id")
    .single();
  if (assetError) throw assetError;
  const { data: version, error: versionError } = await admin
    .from("creative_versions")
    .insert({ creative_id: post.id, version_no: 1, asset_id: asset.id, created_by: staffId })
    .select("id")
    .single();
  if (versionError) throw versionError;
  const staff = await session(frank.staffEmail, frank.staffPassword);
  const { data: me } = await staff.auth.getUser();
  const { error: commentError } = await staff
    .from("comments")
    .insert({ creative_id: post.id, creative_version_id: version.id, author_id: me.user!.id, body: `Kept comment ${post.id}`, visibility: "public" });
  if (commentError) throw commentError;
  return { id: post.id as string, path, assetId: asset.id as string, versionId: version.id as string };
}

async function fileExists(path: string) {
  const { data } = await admin.storage.from("assets").download(path);
  return !!data;
}

test("an Approved post's artwork goes 7 days after going live, keeping its copy and comments", async ({ page, frank }) => {
  test.setTimeout(120_000);
  const gone = await postWithArtwork(frank, frank.projectId, { name: "Live Ten Days", stage: 4, approved_at: daysAgo(12), scheduled_at: daysAgo(10) });
  const inReview = await postWithArtwork(frank, frank.projectId, { name: "Still In Review", stage: 3, scheduled_at: daysAgo(10) });
  const recent = await postWithArtwork(frank, frank.projectId, { name: "Live Two Days", stage: 4, approved_at: daysAgo(3), scheduled_at: daysAgo(2) });

  const { data: keys, error } = await admin.rpc("run_artwork_housekeeping", { p_agency_id: frank.agencyId });
  expect(error).toBeNull();
  expect(keys).toEqual([gone.path]);
  // What the cron route then does with them.
  await admin.storage.from("assets").remove(keys as string[]);

  const { data: version } = await admin.from("creative_versions").select("asset_id").eq("id", gone.versionId).single();
  expect(version!.asset_id).toBeNull();
  expect((await admin.from("assets").select("id").eq("id", gone.assetId)).data).toEqual([]);
  expect(await fileExists(gone.path)).toBe(false);
  const { data: comments } = await admin.from("comments").select("body").eq("creative_version_id", gone.versionId);
  expect(comments).toEqual([{ body: `Kept comment ${gone.id}` }]);
  const { data: removed } = await admin.from("creatives").select("artwork_removed_at").eq("id", gone.id).single();
  expect(removed!.artwork_removed_at).not.toBeNull();
  // Still in review, or live only two days: untouched.
  for (const kept of [inReview, recent]) {
    expect(await fileExists(kept.path)).toBe(true);
    const { data: v } = await admin.from("creative_versions").select("asset_id").eq("id", kept.versionId).single();
    expect(v!.asset_id).toBe(kept.assetId);
  }

  await frank.loginAsStaff(page);
  // Live two days: the warning, with the day it goes.
  await page.goto(`${APP_URL}/creatives/${recent.id}`);
  // Same day/month as the page prints, whatever the time of day.
  const sched = (await admin.from("creatives").select("scheduled_at").eq("id", recent.id).single()).data!.scheduled_at as string;
  const goes = new Date(new Date(sched).getTime() + 7 * DAY).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  await expect(page.locator(".artwork-warn")).toContainText(`Its artwork will be removed on ${goes}`);
  // Removed: said so where the artwork was, and its comment is still there.
  await page.goto(`${APP_URL}/creatives/${gone.id}`);
  await expect(page.locator(".ig-media")).toContainText("Artwork removed");
  await expect(page.locator(".ig-media")).toContainText("7 days after the post went live");
  await expect(page.locator(".artwork-warn")).toHaveCount(0);
  await expect(page.getByText(`Kept comment ${gone.id}`)).toBeVisible();
  // In review: no warning.
  await page.goto(`${APP_URL}/creatives/${inReview.id}`);
  await expect(page.locator(".ig-media img, .ig-media video").first()).toBeVisible();
  await expect(page.locator(".artwork-warn")).toHaveCount(0);

  // The review link says so too.
  const token = await frank.createSharedLink();
  const res = await page.request.post(`${APP_URL}/api/shared-review`, { data: { token } });
  const body = await res.json();
  const shared = (body.creatives ?? body.data?.creatives ?? []).find((c: { id: string }) => c.id === gone.id);
  expect(shared?.artwork_removed_at).toBeTruthy();
});

test("an undated Approved post waits on an Admin: the bell, then Keep or Remove", async ({ page, frank }) => {
  test.setTimeout(150_000);
  const project = await frank.createContinuousProject();
  const base = { destination: "https://example.com/listing", stage: 4, approved_at: daysAgo(20) };
  const keepIt = await postWithArtwork(frank, project, { ...base, name: "Keep This One", due_on: dateAgo(10) });
  const removeIt = await postWithArtwork(frank, project, { ...base, name: "Remove This One", due_on: dateAgo(9) });
  await postWithArtwork(frank, project, { ...base, name: "Not Due Yet", due_on: dateAgo(2) });

  const { data: keys } = await admin.rpc("run_artwork_housekeeping", { p_agency_id: frank.agencyId });
  // Nothing removed without a decision.
  expect(keys).toEqual([]);
  const { data: notes } = await admin.from("notifications").select("user_id, creative_id").eq("agency_id", frank.agencyId);
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  // The Admin, about the two that are due; never the client's person.
  expect(notes!.map((n) => n.user_id)).toEqual([staffId, staffId]);
  expect(notes!.map((n) => n.creative_id).sort()).toEqual([keepIt.id, removeIt.id].sort());

  await frank.loginAsStaff(page);
  const bell = page.getByRole("button", { name: /^Notifications/ });
  await expect(bell.locator(".cnt")).toHaveText("2");
  await bell.click();
  const panel = page.locator(".notif.is-open");
  await expect(panel.locator(".nrow.unread")).toHaveCount(2);
  await expect(panel.locator(".nrow").first()).toContainText("7 days past its due date, with no live date: remove its artwork?");

  // Keep: for good.
  await panel.locator(".nrow", { hasText: "Keep This One" }).click();
  const modal = page.locator(".scrim:not(.closing) .modal");
  await expect(modal).toContainText("Remove Artwork?");
  await expect(modal).toContainText("Keep This One");
  await modal.getByRole("button", { name: "Keep Artwork" }).click();
  await expect(page.locator(".scrim:not(.closing)")).toHaveCount(0);
  expect((await admin.from("creatives").select("artwork_kept_at").eq("id", keepIt.id).single()).data!.artwork_kept_at).not.toBeNull();
  expect(await fileExists(keepIt.path)).toBe(true);
  await admin.rpc("run_artwork_housekeeping", { p_agency_id: frank.agencyId });
  expect((await admin.from("notifications").select("id").eq("creative_id", keepIt.id)).data).toEqual([]);

  // Remove: the files go, the comment stays.
  await bell.click();
  await expect(panel.locator(".nrow")).toHaveCount(1);
  await panel.locator(".nrow", { hasText: "Remove This One" }).click();
  await modal.getByRole("button", { name: "Remove Artwork" }).click();
  await expect(page.locator(".scrim:not(.closing)")).toHaveCount(0);
  expect(await fileExists(removeIt.path)).toBe(false);
  expect((await admin.from("comments").select("id").eq("creative_version_id", removeIt.versionId)).data).toHaveLength(1);
  await expect(bell.locator(".cnt")).toHaveCount(0);
  await bell.click();
  await expect(panel).toContainText("You're all caught up.");
});

test("only Owners and Admins decide, notifications are each person's own, and the cron needs its secret", async ({ page, frank }) => {
  const project = await frank.createContinuousProject();
  const post = await postWithArtwork(frank, project, {
    name: "Undated",
    destination: "https://example.com/listing",
    stage: 4,
    approved_at: daysAgo(20),
    due_on: dateAgo(10),
  });
  await admin.rpc("run_artwork_housekeeping", { p_agency_id: frank.agencyId });

  const asClient = await session(frank.clientEmail, frank.clientPassword);
  expect((await asClient.rpc("remove_creative_artwork_now", { p_creative_id: post.id })).error?.message).toMatch(/not permitted|post not found/);
  expect((await asClient.rpc("keep_creative_artwork", { p_creative_id: post.id })).error?.message).toMatch(/not permitted|post not found/);
  expect((await asClient.from("notifications").select("id")).data).toEqual([]);
  expect((await asClient.rpc("run_artwork_housekeeping", { p_agency_id: frank.agencyId })).error).not.toBeNull();

  // A User on the team can't either.
  await admin.from("memberships").update({ role: "user" }).eq("agency_id", frank.agencyId).eq("user_id", (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id);
  const asUser = await session(frank.staffEmail, frank.staffPassword);
  expect((await asUser.rpc("remove_creative_artwork_now", { p_creative_id: post.id })).error?.message).toMatch(/not permitted|post not found/);
  // Nor write a notification for anyone.
  const { error: insertError } = await asUser
    .from("notifications")
    .insert({ agency_id: frank.agencyId, user_id: (await asUser.auth.getUser()).data.user!.id, kind: "artwork_removal", creative_id: post.id });
  expect(insertError).not.toBeNull();
  expect(await fileExists(post.path)).toBe(true);

  // The daily run's route: refused without its secret.
  expect((await page.request.get(`${APP_URL}/api/cron/artwork`)).status()).toBe(401);
  expect((await page.request.get(`${APP_URL}/api/cron/artwork`, { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
  // Vercel's cron calls the main address, which shows the welcome page for
  // almost every path: the run's own must reach the route.
  const atMain = await page.request.get(`${APP_URL}/api/cron/artwork`, { headers: { host: "frank.localhost:3000" } });
  expect(atMain.status()).toBe(401);
  expect(await atMain.json()).toEqual({ error: "Not allowed" });
});
