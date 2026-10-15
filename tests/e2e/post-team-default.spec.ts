import { createClient } from "@supabase/supabase-js";
import { test, expect } from "./fixtures";

// Who's on a new post by default (phase101, direct instruction): ticked in
// the project's settings, they start every new post's Team, which can still
// be changed. Owners and Admins choose; the database refuses a User.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

test("a project's New posts tick puts someone on every new post's Team", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;

  // The fixture's staff is an Admin: listed on every project, with the tick.
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const tick = page.getByRole("dialog", { name: "E2E Test Project" }).getByLabel("Add E2E Staff to new posts");
  await expect(tick).not.toBeChecked();
  await tick.click();
  await expect(tick).toBeChecked();
  await expect
    .poll(async () => (await admin.from("projects").select("default_team_user_ids").eq("id", frank.projectId).single()).data!.default_team_user_ids)
    .toEqual([staffId]);
  await page.keyboard.press("Escape");

  // A new post starts with them on its Team, and it saves that way.
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await page.click('button:has-text("New Post")');
  await expect(page.locator(".field", { has: page.locator('label[for="nbTeam"]') })).toContainText("E2E Staff");
  await page.fill("#nbName", "Default Team E2E");
  await page.fill("#nbDate", "2027-04-01");
  await page.click('button:has-text("Create Post")');
  await expect
    .poll(async () => (await admin.from("creatives").select("team_user_ids").eq("project_id", frank.projectId).eq("name", "Default Team E2E").maybeSingle()).data?.team_user_ids)
    .toEqual([staffId]);

  // A User can't change the list.
  const { data: m } = await admin.from("memberships").update({ role: "user" }).eq("user_id", staffId).eq("agency_id", frank.agencyId).select("id").single();
  await admin.from("staff_client_access").insert({ membership_id: m!.id, client_id: frank.clientId });
  const u = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await u.auth.signInWithPassword({ email: frank.staffEmail, password: frank.staffPassword });
  const refused = await u.from("projects").update({ default_team_user_ids: [] }).eq("id", frank.projectId).select("id");
  expect(refused.error?.message ?? "").toContain("Only Owners and Admins can change a project's details");
});
