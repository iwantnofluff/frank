import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { test, expect, APP_URL, type Frank } from "./fixtures";

// The admin area acting inside an agency (phase51): each action asks for a
// reason, is logged, and the agency's Owners can read the log.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ADMIN = "http://admin.frank.localhost:3000";
const PASSWORD = "E2e-Admin-Test-1234!";
const DAY = 24 * 3600_000;

async function makePlatformAdmin() {
  const email = `e2e-platform-admin-${Date.now()}@example.invalid`;
  const { data } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  const id = data.user!.id;
  await admin.from("users").insert({ id, email, name: "Support Sam" });
  await admin.from("platform_admins").insert({ user_id: id });
  return {
    email,
    async cleanup() {
      await admin.from("platform_admins").delete().eq("user_id", id);
      await admin.from("users").delete().eq("id", id);
      await admin.auth.admin.deleteUser(id);
    },
  };
}

async function signIn(page: Page, email: string) {
  await page.goto(`${ADMIN}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${ADMIN}/admin`, { timeout: 20_000 });
}

const log = async (frank: Frank) =>
  (
    await admin
      .from("admin_actions")
      .select("actor_name, action, target, detail, reason")
      .eq("agency_id", frank.agencyId)
      .order("created_at")
  ).data ?? [];

const userIdOf = async (email: string) => (await admin.from("users").select("id").eq("email", email).single()).data!.id as string;

test("the admin resends an invite and changes a role, each with a reason that's logged", async ({ page, frank }) => {
  test.setTimeout(120_000);
  // An invited User, the way the app leaves one.
  const email = `e2e-support-${Date.now()}@example.invalid`;
  const { data: u } = await admin.auth.admin.createUser({ email, email_confirm: true });
  await admin.from("users").insert({ id: u.user!.id, email, name: "Ivy Invited" });
  const staffId = await userIdOf(frank.staffEmail);
  const { data: m } = await admin
    .from("memberships")
    .insert({ agency_id: frank.agencyId, user_id: u.user!.id, role: "user", accepted_at: null, invited_by: staffId, invited_at: new Date().toISOString() })
    .select("id")
    .single();
  await admin.from("invites").insert({ membership_id: m!.id, token_hash: `e2e-old-${Date.now()}`, expires_at: new Date(Date.now() + DAY).toISOString(), created_by: staffId });

  const pa = await makePlatformAdmin();
  try {
    await signIn(page, pa.email);
    await page.goto(`${ADMIN}/admin/users/${u.user!.id}`);
    const here = page.locator(".adminperson", { hasText: "E2E Test Agency" });
    await here.getByRole("button", { name: "Resend Invite" }).click();
    const modal = page.getByRole("dialog", { name: "Resend the Invite" });
    // No reason, no action.
    await expect(modal.getByRole("button", { name: "Resend Invite" })).toBeDisabled();
    await modal.getByLabel(/Reason/).fill("Their first email went to spam");
    await modal.getByRole("button", { name: "Resend Invite" }).click();
    // An agency with no address has nowhere to send them: nothing done or logged.
    await expect(modal).toContainText("This workspace has no address to invite people to");
    expect(await log(frank)).toEqual([]);
    await admin.from("agencies").update({ subdomain: `e2e${Date.now()}` }).eq("id", frank.agencyId);
    await modal.getByRole("button", { name: "Resend Invite" }).click();
    await expect(page.getByRole("status")).toContainText("Invite to E2E Test Agency resent", { timeout: 20_000 });
    await expect(page.getByRole("textbox", { name: `Invite link for ${email}` })).toHaveValue(/\/invite\//);
    const invites = (await admin.from("invites").select("token_hash").eq("membership_id", m!.id)).data!;
    expect(invites).toHaveLength(1);
    expect(invites[0].token_hash).not.toMatch(/^e2e-old-/);

    // The fixture's staff, Admin → User.
    await page.goto(`${ADMIN}/admin/users/${staffId}`);
    await page.locator(".adminperson", { hasText: "E2E Test Agency" }).getByRole("button", { name: "Change Role" }).click();
    const roleModal = page.getByRole("dialog", { name: "Change Their Role" });
    await expect(roleModal.getByLabel("New role").locator("option")).toHaveText(["Owner", "User"]);
    await roleModal.getByLabel("New role").selectOption("user");
    await roleModal.getByLabel(/Reason/).fill("Owner asked on a call");
    await roleModal.getByRole("button", { name: "Change Role" }).click();
    await expect(page.getByRole("status")).toContainText("Now User at E2E Test Agency");
    expect(
      (await admin.from("memberships").select("role").eq("agency_id", frank.agencyId).eq("user_id", staffId).single()).data!.role,
    ).toBe("user");

    // A password reset, to this agency's address.
    await page.getByRole("button", { name: "Send Password Reset" }).click();
    const reset = page.getByRole("dialog", { name: "Send a Password Reset" });
    await expect(reset.getByLabel("Workspace", { exact: true })).toHaveValue(frank.agencyId);
    await reset.getByLabel(/Reason/).fill("Locked out before a client review");
    await reset.getByRole("button", { name: "Send Reset" }).click();
    await expect(page.getByRole("status")).toContainText(`Password reset sent to ${frank.staffEmail}`, { timeout: 20_000 });

    expect(await log(frank)).toEqual([
      expect.objectContaining({ actor_name: "Support Sam", action: "Resent an invite", reason: "Their first email went to spam" }),
      expect.objectContaining({ action: "Changed a role", detail: expect.stringContaining("Admin → User"), reason: "Owner asked on a call" }),
      expect.objectContaining({ action: "Sent a password reset", reason: "Locked out before a client review" }),
    ]);

    // The agency page's Support Log shows both.
    await page.goto(`${ADMIN}/admin/agencies/${frank.agencyId}`);
    const supportLog = page.getByRole("region", { name: "Support log" });
    await expect(supportLog.locator(".srow")).toHaveCount(3);
    await supportLog.screenshot({ path: `${process.env.SHOT_DIR ?? "test-results"}/admin-support-log.png`, animations: "disabled" });
    await expect(supportLog).toContainText("Why: Owner asked on a call");
  } finally {
    await pa.cleanup();
  }
});

test("the admin extends an ended trial and pauses with a reason; the agency's Owner reads the log", async ({ page, browser, frank }) => {
  test.setTimeout(120_000);
  await admin
    .from("agencies")
    .update({ plan: "free", trial_ends_at: new Date(Date.now() - 2 * DAY).toISOString() })
    .eq("id", frank.agencyId);
  const pa = await makePlatformAdmin();
  try {
    await signIn(page, pa.email);
    // Pausing without a reason is refused by the API, not just the window.
    const bare = await page.request.patch(`${ADMIN}/api/admin/agencies/${frank.agencyId}`, { data: { suspended: true } });
    expect(bare.status()).toBe(400);

    await page.goto(`${ADMIN}/admin/agencies/${frank.agencyId}`);
    await page.getByRole("button", { name: "Extend Trial" }).click();
    const modal = page.getByRole("dialog", { name: "Extend the Free Trial" });
    await expect(modal).toContainText("it's read-only");
    await modal.getByLabel("Days to add").fill("14");
    await modal.getByLabel(/Reason/).fill("Needs another fortnight to decide");
    await modal.getByRole("button", { name: "Extend Trial" }).click();
    await expect(modal).toHaveCount(0);
    const ends = new Date((await admin.from("agencies").select("trial_ends_at").eq("id", frank.agencyId).single()).data!.trial_ends_at).getTime();
    // Counted from today, since it had ended.
    expect(Math.abs(ends - (Date.now() + 14 * DAY))).toBeLessThan(5 * 60_000);

    await page.getByRole("button", { name: "Pause Workspace" }).click();
    const pause = page.getByRole("dialog", { name: "Pause E2E Test Agency?" });
    await pause.getByLabel(/Reason/).fill("Testing the pause");
    await pause.getByRole("button", { name: "Pause Workspace" }).click();
    // Closes once the agencies list has reloaded: not instant against staging.
    await expect(pause).toHaveCount(0, { timeout: 20_000 });
    await page.getByRole("button", { name: "Reactivate" }).click();
    const unpause = page.getByRole("dialog", { name: "Reactivate E2E Test Agency?" });
    await unpause.getByLabel(/Reason/).fill("Done testing");
    await unpause.getByRole("button", { name: "Reactivate" }).click();
    await expect(unpause).toHaveCount(0, { timeout: 20_000 });
    expect((await admin.from("agencies").select("suspended_at").eq("id", frank.agencyId).single()).data!.suspended_at).toBeNull();
    expect((await log(frank)).map((a) => a.action)).toEqual([
      "Extended the free trial",
      "Paused the workspace",
      "Unpaused the workspace",
    ]);
  } finally {
    await pa.cleanup();
  }

  // The agency's Owner reads it in Settings; an Admin can't.
  await admin.from("memberships").update({ role: "owner" }).eq("agency_id", frank.agencyId).eq("user_id", await userIdOf(frank.staffEmail));
  const ctx = await browser.newContext();
  try {
    const op = await ctx.newPage();
    await frank.loginAsStaff(op);
    await op.goto(`${APP_URL}/settings/general/support-activity`);
    const activity = op.getByRole("region", { name: "Support activity" });
    await expect(activity.locator(".srow")).toHaveCount(3);
    await expect(activity.locator(".srow").first()).toContainText("Unpaused the workspace");
    await expect(activity).toContainText("Why: Needs another fortnight to decide");
    await expect(activity).toContainText("Support Sam, Frank");
    await op.screenshot({ path: `${process.env.SHOT_DIR ?? "test-results"}/owner-support-activity.png`, animations: "disabled" });

    await admin.from("memberships").update({ role: "admin" }).eq("agency_id", frank.agencyId).eq("user_id", await userIdOf(frank.staffEmail));
    await op.reload();
    await expect(op.getByText("Only Owners can see this.")).toBeVisible();
    // Nor through the database.
    const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email: frank.staffEmail, password: frank.staffPassword });
    expect((await c.from("admin_actions").select("id")).data ?? []).toHaveLength(0);
  } finally {
    await ctx.close();
  }
});
