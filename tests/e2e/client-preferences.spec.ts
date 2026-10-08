import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL, type Frank } from "./fixtures";

// A client's Preferences (phase70, decided directly): Owners and Admins set
// them in Client Settings; the daily artwork run, review links and the
// Share window follow them. The daily run is called for the test agency
// only, as in artwork-removal.spec.ts.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

async function session(email: string, password: string) {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  await c.auth.signInWithPassword({ email, password });
  return c;
}

// An Approved post with one version of real artwork in storage.
async function approvedWithArtwork(frank: Frank, fields: Record<string, unknown>, projectId = frank.projectId) {
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  const { data: post, error } = await admin
    .from("creatives")
    .insert({ project_id: projectId, format: "ig_feed", stage: 4, created_by: staffId, ...fields })
    .select("id")
    .single();
  if (error) throw error;
  const path = `${frank.agencyId}/${post.id}/${crypto.randomUUID()}-art.png`;
  await admin.storage.from("assets").upload(path, PNG, { contentType: "image/png" });
  const { data: asset } = await admin
    .from("assets")
    .insert({ agency_id: frank.agencyId, storage_key: path, filename: "art.png", mime_type: "image/png", bytes: PNG.length, created_by: staffId })
    .select("id")
    .single();
  await admin.from("creative_versions").insert({ creative_id: post.id, version_no: 1, asset_id: asset!.id, created_by: staffId });
  return post.id as string;
}
const removed = async (id: string) =>
  !!(await admin.from("creatives").select("artwork_removed_at").eq("id", id).single()).data!.artwork_removed_at;

test("an Admin sets Preferences, which save at once; a client's own people can't", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/clients/${frank.clientId}/settings/preferences`);
  await page.getByLabel("Keep artwork for").selectOption("14");
  await expect
    .poll(async () => (await admin.from("client_preferences").select("artwork_keep_days").eq("client_id", frank.clientId).maybeSingle()).data?.artwork_keep_days)
    .toBe(14);
  await page.getByLabel("Client can approve").selectOption("no");
  // A client that can't approve: new links can't either, and say so.
  await expect(page.getByLabel("New links can approve")).toBeDisabled();
  await expect(page.getByLabel("New links can approve")).toHaveValue("no");

  // A client's person: the page isn't theirs, and the database refuses them.
  const client = await session(frank.clientEmail, frank.clientPassword);
  const { data } = await client
    .from("client_preferences")
    .upsert({ client_id: frank.clientId, artwork_keep_days: 28 }, { onConflict: "client_id" })
    .select("client_id");
  expect(data ?? []).toHaveLength(0);
  expect((await admin.from("client_preferences").select("artwork_keep_days").eq("client_id", frank.clientId).single()).data!.artwork_keep_days).toBe(14);
});

test("the daily run keeps artwork as long as the client chose, and removes undated posts when set to", async ({ frank }) => {
  await admin.from("client_preferences").insert({ client_id: frank.clientId, artwork_keep_days: 14, undated_artwork: "remove" });
  const tenDays = await approvedWithArtwork(frank, { name: "Live Ten Days", approved_at: daysAgo(12), scheduled_at: daysAgo(10) });
  const twentyDays = await approvedWithArtwork(frank, { name: "Live Twenty Days", approved_at: daysAgo(22), scheduled_at: daysAgo(20) });
  // No live date: an Other Content project's post.
  const undated = await approvedWithArtwork(frank, { name: "No Live Date", approved_at: daysAgo(16), destination: "Website" }, await frank.createContinuousProject());

  const { error } = await admin.rpc("run_artwork_housekeeping", { p_agency_id: frank.agencyId });
  expect(error).toBeNull();
  // 14 days: ten days live is kept, twenty isn't; the undated one is
  // removed, not asked about.
  expect(await removed(tenDays)).toBe(false);
  expect(await removed(twentyDays)).toBe(true);
  expect(await removed(undated)).toBe(true);
  const { data: asked } = await admin.from("notifications").select("id").eq("creative_id", undated);
  expect(asked ?? []).toHaveLength(0);
});

test("a review link follows the client: no approving, no other posts, and when Approved artwork goes", async ({ page, frank }) => {
  await admin
    .from("client_preferences")
    .insert({ client_id: frank.clientId, client_can_approve: false, feed_shows_other_posts: false, artwork_keep_days: 21 });
  await frank.createCreativeAtStage(2, "Unshared internal post");
  const approved = await frank.createCreativeAtStage(4, "Approved post");
  const token = await frank.createSharedLink({ canApprove: true });
  await admin.from("shared_links").update({ scope: "all" }).eq("token", token);

  const body = await (await page.request.post(`${APP_URL}/api/shared-review`, { data: { token } })).json();
  expect(body.can_approve).toBe(false);
  expect(body.artwork_keep_days).toBe(21);
  expect((body.feed as { id: string | null }[]).every((e) => e.id !== null)).toBe(true);
  // Approving is refused by the database itself, whatever the page shows.
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data: refused } = await anon.rpc("submit_shared_approval", {
    p_token: token,
    p_passcode: null,
    p_creative_id: frank.creativeId,
    p_guest_name: "Guest",
    p_guest_email: null,
  });
  expect(refused).toEqual({ status: "not_allowed" });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}/review/${token}`);
  await expect(page.locator(".dk-group-h", { hasText: "Approved" })).toContainText("Artwork removed 21 days after going live");
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  expect(approved).toBeTruthy();
});

test("the Share window starts from the client's link defaults", async ({ page, frank }) => {
  await admin
    .from("client_preferences")
    .insert({ client_id: frank.clientId, link_expires_days: 30, link_passcode: true, link_can_approve: false });
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: /^Share/ }).first().click();
  await expect(page.locator("#shExp")).toHaveValue("30");
  await expect(page.locator("#shCode")).toHaveValue("on");
  await expect(page.getByRole("button", { name: "Let them approve" })).toHaveAttribute("aria-pressed", "false");
});
