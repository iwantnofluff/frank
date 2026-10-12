import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";

// The bell in Unread and Read (direct instruction), and read notifications
// leaving after the workspace's keep time (phase90): set in Settings →
// General → Notifications, removed by the daily run.

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
