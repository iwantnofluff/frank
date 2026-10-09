import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL, PHONE_VIEWPORT, type Frank } from "./fixtures";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// A client's comment and approval reach the team (phase80, direct
// instruction): in the bell, owed an email (marked sent; .invalid addresses
// are never really mailed), and a team member's own comment tells no one.
test("a client's comment and approval reach the team's bell, and are emailed", async ({ page, browser, frank }) => {
  test.setTimeout(150_000);
  await admin.from("client_preferences").upsert({ client_id: frank.clientId, notify_in_app: true, notify_email: true, notify_who: "everyone" }, { onConflict: "client_id" });
  await frank.createClientContact("Priya Client", "priya@example.invalid");
  const token = await frank.createSharedLink({ canApprove: true });
  const guestCtx = await browser.newContext({ viewport: PHONE_VIEWPORT });
  const g = await guestCtx.newPage();
  await g.goto(APP_URL + "/review/" + token);
  await g.waitForSelector(".m-top");
  await g.locator("select").first().selectOption({ label: "Priya Client" });
  await g.getByPlaceholder("Add a comment…").fill("Can the logo be bigger?");
  await g.getByRole("button", { name: "Post", exact: true }).click();
  await expect(g.locator(".m-cmt:not(.pending)", { hasText: "logo be bigger" })).toBeVisible({ timeout: 15_000 });
  await g.getByRole("button", { name: "Approve" }).click();
  await expect(g.getByRole("button", { name: "Approved" })).toBeVisible({ timeout: 15_000 });
  await g.waitForTimeout(3000);
  await guestCtx.close();
  const { data: rows } = await admin.from("notifications").select("kind, in_app, email_due, emailed_at, comment_id").eq("creative_id", frank.creativeId).order("created_at");
  expect(rows?.map((r) => [r.kind, r.in_app, r.email_due, !!r.emailed_at, !!r.comment_id])).toEqual([
    ["client_comment", true, true, true, true],
    ["client_approval", true, true, true, false],
  ]);
  await frank.insertCommentAsStaff("Team note, no notice please", "public");
  const { count } = await admin.from("notifications").select("id", { count: "exact", head: true }).eq("creative_id", frank.creativeId);
  expect(count).toBe(2);
  await frank.loginAsStaff(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(APP_URL + "/dashboard");
  await page.getByRole("button", { name: "Notifications" }).click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await expect(panel).toContainText("Priya Client commented on", { timeout: 20_000 });
  await expect(panel).toContainText("approved");
  await panel.locator(".nrow", { hasText: "commented on" }).click();
  await page.waitForURL("**/creatives/" + frank.creativeId, { timeout: 15_000 });
});

// Who hears, by the client's Preferences (decided directly): the post's
// lead, everyone on the client, or Owners and Admins; nothing when both the
// bell and email are off. A User on the project is "everyone" but not an
// Admin; the fixture's staff member is the lead and an Admin.
test("who hears follows the client's choice", async ({ frank }) => {
  test.setTimeout(90_000);
  const user = await teamUser(frank);
  try {
    const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id as string;
    await admin.from("creatives").update({ lead_user_id: staffId }).eq("id", frank.creativeId);
    await frank.createClientContact("Priya Client", "priya@example.invalid");
    const token = await frank.createSharedLink();
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    const heard = async (prefs: Record<string, unknown>, body: string) => {
      await admin.from("client_preferences").upsert({ client_id: frank.clientId, ...prefs }, { onConflict: "client_id" });
      const r = await anon.rpc("submit_shared_comment", {
        p_token: token, p_passcode: null, p_creative_id: frank.creativeId, p_body: body, p_guest_name: "Priya Client", p_guest_email: "priya@example.invalid",
      });
      expect(r.data).toMatchObject({ status: "ok" });
      const { data } = await admin.from("notifications").select("user_id").eq("comment_id", r.data.comment_id);
      return (data ?? []).map((n) => (n.user_id === staffId ? "lead/admin" : n.user_id === user.userId ? "user" : "other")).sort();
    };
    expect(await heard({ notify_in_app: true, notify_who: "lead" }, "One")).toEqual(["lead/admin"]);
    expect(await heard({ notify_who: "everyone" }, "Two")).toEqual(["lead/admin", "user"]);
    expect(await heard({ notify_who: "admins" }, "Three")).toEqual(["lead/admin"]);
    // No lead: "lead" means everyone on the client.
    await admin.from("creatives").update({ lead_user_id: null }).eq("id", frank.creativeId);
    expect(await heard({ notify_who: "lead" }, "Four")).toEqual(["lead/admin", "user"]);
    expect(await heard({ notify_in_app: false, notify_email: false }, "Five")).toEqual([]);
  } finally {
    await admin.from("notifications").delete().eq("user_id", user.userId);
    await admin.from("project_access").delete().eq("membership_id", user.membershipId);
    await admin.from("memberships").delete().eq("id", user.membershipId);
    await admin.from("users").delete().eq("id", user.userId);
    await admin.auth.admin.deleteUser(user.userId);
  }
});

// A User on the team, on the fixture's project only.
async function teamUser(frank: Frank) {
  const email = `e2e-member-${Date.now()}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  const userId = data.user.id;
  await admin.from("users").insert({ id: userId, email, name: "Project User" });
  const { data: m, error: mErr } = await admin
    .from("memberships")
    .insert({ agency_id: frank.agencyId, user_id: userId, role: "user", accepted_at: new Date().toISOString() })
    .select("id")
    .single();
  if (mErr) throw mErr;
  await admin.from("project_access").upsert({ membership_id: m.id, project_id: frank.projectId }, { onConflict: "membership_id,project_id" });
  return { userId, membershipId: m.id as string };
}
