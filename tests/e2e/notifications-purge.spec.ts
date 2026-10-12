import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";

// The bell in Unread and Read (direct instruction), and read notifications
// leaving after the workspace's keep time (phase90): set in Settings →
// General → Notifications, removed by the daily run. Its All / Unread /
// Read counts, filter by person and client, and deleting read ones
// (phase91).

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

test("the bell splits Unread and Read, and read ones go after the workspace's keep time", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  const older = await frank.createCreativeAtStage(4, "Read long ago");
  const recent = await frank.createCreativeAtStage(4, "Read lately");
  const day = 86_400_000;
  const { error } = await admin.from("notifications").insert([
    { agency_id: frank.agencyId, user_id: staffId, kind: "artwork_removal", creative_id: frank.creativeId, created_at: new Date(Date.now() - 100 * day).toISOString(), read_at: null },
    { agency_id: frank.agencyId, user_id: staffId, kind: "artwork_removal", creative_id: older, created_at: new Date(Date.now() - 50 * day).toISOString(), read_at: new Date(Date.now() - 40 * day).toISOString() },
    { agency_id: frank.agencyId, user_id: staffId, kind: "artwork_removal", creative_id: recent, created_at: new Date(Date.now() - 20 * day).toISOString(), read_at: new Date(Date.now() - 10 * day).toISOString() },
  ]);
  if (error) throw new Error(error.message);

  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/dashboard`);
  await page.getByRole("button", { name: /Notifications/ }).click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await expect(panel.locator(".notif-sec")).toHaveText(["Unread", "Read"]);
  await expect(panel.locator(".notif-tabs .chip")).toHaveText(["All (3)", "Unread (1)", "Read (2)"]);
  await expect(panel.locator(".nrow.unread")).toHaveCount(1);
  await expect(panel.locator(".nrow:not(.unread)")).toHaveCount(2);

  // An Admin sets 30 days.
  await page.goto(`${APP_URL}/settings/general/notifications`);
  await expect(page.getByLabel("Keep read notifications for")).toHaveValue("90");
  await page.getByLabel("Keep read notifications for").selectOption("30");
  await expect
    .poll(async () => (await admin.from("agency_settings").select("notification_keep_days").eq("agency_id", frank.agencyId).maybeSingle()).data?.notification_keep_days)
    .toBe(30);

  // The daily run: the one read 40 days ago goes; the one read 10 days ago,
  // and the unread one however old, stay.
  const { error: purgeError } = await admin.rpc("purge_read_notifications");
  expect(purgeError).toBeNull();
  const { data: left } = await admin.from("notifications").select("creative_id").eq("user_id", staffId);
  expect((left ?? []).map((n) => n.creative_id).sort()).toEqual([frank.creativeId, recent].sort());

  // Nobody signed in can run it.
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { error: denied } = await anon.rpc("purge_read_notifications");
  expect(denied).not.toBeNull();
});

test("the bell counts, filters by person, and deletes selected read ones", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  const a = await frank.createCreativeAtStage(4, "Asha's post");
  const b = await frank.createCreativeAtStage(4, "Ben's post");
  const c = await frank.createCreativeAtStage(4, "Cara's post");
  await admin.from("creatives").update({ approved_by_name: "Asha Client" }).eq("id", a);
  await admin.from("creatives").update({ approved_by_name: "Ben Client" }).eq("id", b);
  await admin.from("creatives").update({ approved_by_name: "Asha Client" }).eq("id", c);
  const now = new Date().toISOString();
  const { error } = await admin.from("notifications").insert([
    { agency_id: frank.agencyId, user_id: staffId, kind: "artwork_removal", creative_id: frank.creativeId, created_at: now, read_at: null },
    { agency_id: frank.agencyId, user_id: staffId, kind: "client_approval", creative_id: a, created_at: now, read_at: now },
    { agency_id: frank.agencyId, user_id: staffId, kind: "client_approval", creative_id: b, created_at: now, read_at: now },
    { agency_id: frank.agencyId, user_id: staffId, kind: "client_approval", creative_id: c, created_at: now, read_at: now },
  ]);
  if (error) throw new Error(error.message);

  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/dashboard`);
  await page.getByRole("button", { name: /Notifications/ }).click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  const chips = panel.locator(".notif-tabs .chip");
  await expect(chips).toHaveText(["All (4)", "Unread (1)", "Read (3)"]);
  await panel.getByRole("button", { name: "Unread (1)", exact: true }).click();
  await expect(panel.locator(".nrow")).toHaveCount(1);
  await panel.getByRole("button", { name: "Read (3)", exact: true }).click();
  await expect(panel.locator(".nrow")).toHaveCount(3);

  // By person: Asha's two.
  await panel.getByRole("button", { name: "Filter by person or client" }).click();
  await panel.getByLabel("Asha Client").check();
  await expect(chips).toHaveText(["All (2)", "Unread (0)", "Read (2)"]);
  await panel.getByRole("button", { name: "Clear" }).click();
  await expect(chips).toHaveText(["All (4)", "Unread (1)", "Read (3)"]);

  // Ticks only on the Read tab (direct instruction).
  await panel.getByRole("button", { name: "All (4)", exact: true }).click();
  await expect(panel.locator(".nrow-sel")).toHaveCount(0);
  await expect(panel.getByLabel("Select all read")).toHaveCount(0);
  await panel.getByRole("button", { name: "Read (3)", exact: true }).click();
  await expect(panel.locator(".notif-all")).toHaveText("All");
  // One selected and deleted, then the rest with select all.
  await panel.getByLabel("Select Ben's post").check();
  await panel.getByRole("button", { name: "Delete (1)" }).click();
  await expect(chips).toHaveText(["All (3)", "Unread (1)", "Read (2)"]);
  await panel.getByLabel("Select all read").check();
  await panel.getByRole("button", { name: "Delete (2)" }).click();
  await expect(chips).toHaveText(["All (1)", "Unread (1)", "Read (0)"]);
  const { data: left } = await admin.from("notifications").select("creative_id").eq("user_id", staffId);
  expect((left ?? []).map((n) => n.creative_id)).toEqual([frank.creativeId]);

  // In the database: an unread one can't be deleted, even your own.
  const me = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  await me.auth.signInWithPassword({ email: frank.staffEmail, password: frank.staffPassword });
  const { data: gone } = await me.from("notifications").delete().eq("creative_id", frank.creativeId).select("id");
  expect(gone ?? []).toHaveLength(0);
});
