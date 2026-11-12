import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";

// A status can hide its posts (phase143, direct instruction: a Cancelled
// post shouldn't appear): Cancel does, from the start. Its posts are left
// out of the table and the dashboard's counts; Show Hidden in the status
// filter brings them back; turning the status's switch off in Settings →
// Statuses (phase151) shows them again.
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

test("a Cancelled post is hidden from the table and the counts, Show Hidden brings it back, and the switch can be turned off", async ({ page, frank }) => {
  test.setTimeout(150_000);
  const list = (await admin.from("stage_statuses").select("id, label, hides_post").eq("agency_id", frank.agencyId)).data!;
  // Cancel hides its posts from the start; nothing else does.
  expect(list.filter((s) => s.hides_post).map((s) => s.label)).toEqual(["Cancel"]);
  const cancel = list.find((s) => s.label === "Cancel")!.id;
  await admin.from("creatives").update({ stage: 3, scheduled_at: new Date().toISOString() }).eq("id", frank.creativeId);
  const { data: set } = await admin.from("creatives").update({ status_id: cancel }).eq("id", frank.creativeId).select("status_id").single();
  expect(set!.status_id).toBe(cancel);

  // The dashboard's counts, as the team member asks for them.
  const staff = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await staff.auth.signInWithPassword({ email: frank.staffEmail, password: frank.staffPassword });
  const counted = async () => ((await staff.rpc("creative_stage_counts")).data ?? []).reduce((n: number, r: { n: number }) => n + Number(r.n), 0);
  expect(await counted()).toBe(0);

  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  await admin.from("memberships").update({ role: "owner" }).eq("user_id", staffId).eq("agency_id", frank.agencyId);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  const row = page.locator("tr[data-row]", { hasText: "E2E Test Creative" });
  await expect(page.getByText("Nothing scheduled")).toBeVisible({ timeout: 20_000 });
  await expect(row).toHaveCount(0);

  // Show Hidden: back, until it's unticked.
  const filterBtn = page.getByRole("button", { name: "Status", exact: true });
  await expect(filterBtn).toHaveText("All Statuses");
  await filterBtn.click();
  const pop = page.getByRole("dialog", { name: "Statuses" });
  await pop.getByRole("checkbox", { name: "Show Hidden" }).click();
  await pop.getByRole("button", { name: "Done" }).click();
  await expect(filterBtn).toHaveText("All Statuses + Hidden");
  await expect(row).toHaveCount(1);
  await expect(row.locator(".stagepill, .pillsel, button").filter({ hasText: "3d. Cancel" }).first()).toBeVisible();
  await filterBtn.click();
  await pop.getByRole("checkbox", { name: "Show Hidden" }).click();
  await pop.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Nothing scheduled")).toBeVisible();

  // Its switch off in Settings → Statuses (phase151): the post shows
  // again, and is counted.
  await page.goto(`${APP_URL}/settings/general/statuses`);
  const cancelRow = page.getByRole("group", { name: "Internal Review" }).locator(".ps-row", { has: page.getByLabel("Name of Cancel") });
  const sw = cancelRow.getByRole("checkbox", { name: "Hides its posts" });
  await expect(sw).toBeChecked();
  // It flips once saved, as the other Settings controls do.
  await sw.click();
  await expect(sw).not.toBeChecked();
  await expect.poll(async () => (await admin.from("stage_statuses").select("hides_post").eq("id", cancel).single()).data!.hides_post).toBe(false);
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  await expect(row).toHaveCount(1, { timeout: 20_000 });
  expect(await counted()).toBe(1);
});
