import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL, type Frank } from "./fixtures";

// Everyone manages the people below them (phase49): switching a User and a
// Client, resending and removing invites, and the database holding the line.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const userIdOf = async (email: string) => (await admin.from("users").select("id").eq("email", email).single()).data!.id as string;

async function setStaffRole(frank: Frank, role: string) {
  await admin.from("memberships").update({ role }).eq("agency_id", frank.agencyId).eq("user_id", await userIdOf(frank.staffEmail));
}

async function staffSession(frank: Frank) {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  await c.auth.signInWithPassword({ email: frank.staffEmail, password: frank.staffPassword });
  return c;
}

async function seedMember(frank: Frank, role: string, name: string, pending = false) {
  const email = `e2e-below-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.invalid`;
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true });
  await admin.from("users").insert({ id: data.user!.id, email, name });
  const { data: m } = await admin
    .from("memberships")
    .insert({
      agency_id: frank.agencyId,
      user_id: data.user!.id,
      role,
      accepted_at: pending ? null : new Date().toISOString(),
    })
    .select("id")
    .single();
  return m!.id as string;
}

test("an Admin switches an invited User to Client and back, then resends and removes the invite", async ({
  page,
  frank,
}) => {
  test.setTimeout(120_000);
  const second = await frank.createContinuousProject();
  // Invited the way the app does, by an Owner.
  await setStaffRole(frank, "owner");
  await frank.loginAsStaff(page);
  const email = `e2e-switch-${Date.now()}@example.invalid`;
  const res = await page.request.post(`${APP_URL}/api/team/invite`, {
    data: {
      agencyId: frank.agencyId,
      email,
      firstName: "pat",
      lastName: "pending",
      role: "user",
      clientIds: [frank.clientId],
      projectIds: [frank.projectId],
    },
  });
  expect(res.status()).toBe(201);
  const { membershipId } = await res.json();
  const projectsOf = async () =>
    ((await admin.from("project_access").select("project_id").eq("membership_id", membershipId)).data ?? []).map(
      (r) => r.project_id,
    );
  expect(await projectsOf()).toEqual([frank.projectId]);
  const contact = async () =>
    (await admin.from("client_contacts").select("archived_at").eq("client_id", frank.clientId).eq("email", email).maybeSingle())
      .data;

  // Now an Admin, without the invite switch.
  await setStaffRole(frank, "admin");
  await page.goto(`${APP_URL}/dashboard`);
  // Client Settings → People.
  await page.goto(`${APP_URL}/clients/${frank.clientId}/settings/people`);
  const profile = page.locator(".setmain");
  const row = profile.locator(".profperson", { hasText: "Pat Pending" });
  await expect(row).toContainText("User");

  await row.getByRole("button", { name: "Options for Pat Pending" }).click();
  await page.locator(".colpop").getByRole("button", { name: "Make Client" }).click();
  await expect(profile.getByRole("status")).toHaveText("Pat Pending is now a Client");
  await expect(row.locator(".tag.blue")).toHaveText("Client");
  const { data: asClient } = await admin.from("memberships").select("role, client_id").eq("id", membershipId).single();
  expect(asClient).toEqual({ role: "user", client_id: frank.clientId });
  expect((await admin.from("staff_client_access").select("id").eq("membership_id", membershipId)).data).toEqual([]);
  // Same projects, and on the review link's list.
  expect(await projectsOf()).toEqual([frank.projectId]);
  expect((await contact())?.archived_at).toBeNull();

  await row.getByRole("button", { name: "Options for Pat Pending" }).click();
  await page.locator(".colpop").getByRole("button", { name: "Make User" }).click();
  await expect(profile.getByRole("status")).toHaveText("Pat Pending is now a User");
  await expect(row.locator(".tag.blue")).toHaveText("User");
  const { data: asUser } = await admin.from("memberships").select("role, client_id").eq("id", membershipId).single();
  expect(asUser).toEqual({ role: "user", client_id: null });
  expect((await admin.from("staff_client_access").select("client_id").eq("membership_id", membershipId)).data).toEqual([
    { client_id: frank.clientId },
  ]);
  // Not put on the second project by getting the client back.
  expect(await projectsOf()).toEqual([frank.projectId]);
  expect(await projectsOf()).not.toContain(second);
  expect((await contact())?.archived_at).not.toBeNull();

  // Resend: a new link, the old one gone.
  const before = (await admin.from("invites").select("id").eq("membership_id", membershipId)).data!.map((r) => r.id);
  await row.getByRole("button", { name: "Options for Pat Pending" }).click();
  await page.locator(".colpop").getByRole("button", { name: "Resend Invite" }).click();
  await expect(profile.getByRole("status")).toHaveText(`Invite resent to ${email}`, { timeout: 20_000 });
  await expect(profile.getByRole("textbox", { name: `Invite link for ${email}` })).toHaveValue(/\/invite\//);
  const after = (await admin.from("invites").select("id").eq("membership_id", membershipId)).data!.map((r) => r.id);
  expect(after).toHaveLength(1);
  expect(before).not.toContain(after[0]);

  // Remove: gone.
  await row.getByRole("button", { name: "Options for Pat Pending" }).click();
  await page.locator(".colpop").getByRole("button", { name: "Remove Invite" }).click();
  await expect(profile.getByRole("status")).toHaveText(`Invite to ${email} removed`);
  await expect(row).toHaveCount(0);
  expect((await admin.from("memberships").select("id").eq("id", membershipId)).data).toEqual([]);
});

test("the database holds the line: nobody changes their equal or anyone above, or gives their own rank", async ({
  frank,
}) => {
  test.setTimeout(60_000);
  const fellowAdmin = await seedMember(frank, "admin", "Fellow Admin");
  const pendingAdmin = await seedMember(frank, "admin", "Pending Admin", true);
  const someUser = await seedMember(frank, "user", "Some User");
  const fellowOwner = await seedMember(frank, "owner", "Fellow Owner");

  // As an Admin.
  await setStaffRole(frank, "admin");
  let c = await staffSession(frank);
  expect((await c.rpc("change_member_type", { p_membership_id: fellowAdmin, p_type: "user" })).error?.code).toBe("42501");
  expect((await c.rpc("change_member_type", { p_membership_id: someUser, p_type: "admin" })).error?.code).toBe("42501");
  expect((await c.from("memberships").update({ role: "admin" }).eq("id", someUser).select("id")).error?.code).toBe("42501");
  expect((await c.from("memberships").delete().eq("id", pendingAdmin).select("id")).data ?? []).toHaveLength(0);
  // An active User below them: not removed by an Admin (Owners only).
  expect((await c.from("memberships").delete().eq("id", someUser).select("id")).data ?? []).toHaveLength(0);

  // As an Owner: Admins yes, other Owners no.
  await setStaffRole(frank, "owner");
  c = await staffSession(frank);
  expect((await c.rpc("change_member_type", { p_membership_id: fellowOwner, p_type: "admin" })).error?.code).toBe("42501");
  expect((await c.rpc("change_member_type", { p_membership_id: someUser, p_type: "owner" })).error?.code).toBe("42501");
  expect((await c.rpc("change_member_type", { p_membership_id: fellowAdmin, p_type: "user" })).error).toBeNull();
  expect((await admin.from("memberships").select("role").eq("id", fellowAdmin).single()).data!.role).toBe("user");
});
