import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL, type Frank, PHONE_VIEWPORT } from "./fixtures";

// Inviting people as a client is created (phase44): Owner, Admin, User or
// Client, names and all; the links to share; a Client seeing only public
// comments; and an Owner letting an Admin invite.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const userIdOf = async (email: string) => (await admin.from("users").select("id").eq("email", email).single()).data!.id as string;

async function setStaffRole(frank: Frank, role: string) {
  await admin.from("memberships").update({ role }).eq("agency_id", frank.agencyId).eq("user_id", await userIdOf(frank.staffEmail));
}

// An accepted Admin with a password, to sign in as.
async function seedAdmin(frank: Frank) {
  const email = `e2e-admin2-${Date.now()}@example.invalid`;
  const password = "E2e-Admin2-1234!";
  const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  await admin.from("users").insert({ id: data.user!.id, email, name: "Second Admin" });
  const { data: m } = await admin
    .from("memberships")
    .insert({ agency_id: frank.agencyId, user_id: data.user!.id, role: "admin", accepted_at: new Date().toISOString() })
    .select("id")
    .single();
  return { email, password, userId: data.user!.id, membershipId: m!.id as string };
}

test("an Owner invites a User and a Client while creating a client, and the Client joins through the link", async ({
  page,
  browser,
  frank,
}) => {
  test.setTimeout(120_000);
  await setStaffRole(frank, "owner");
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/dashboard`);
  await page.getByRole("button", { name: "New Client" }).click();
  const modal = page.getByRole("dialog", { name: "New Client" });
  await modal.locator("#cName").fill("E2E Invite Client");
  await expect(modal).toContainText("team places left on your plan; Clients don't use one");

  const userEmail = `e2e-inv-user-${Date.now()}@example.invalid`;
  const clientEmail = `e2e-inv-client-${Date.now()}@example.invalid`;
  for (const [first, last, email, role] of [
    ["una", "user", userEmail, "user"],
    ["cleo", "client", clientEmail, "client"],
  ]) {
    await modal.getByRole("button", { name: "+ Invite someone" }).click();
    const row = modal.locator(".invrow").last();
    await row.getByLabel("First name").fill(first);
    await row.getByLabel("Last name").fill(last);
    await row.getByLabel("Email").fill(email);
    await row.getByLabel("Role").selectOption(role);
  }
  // Every role an Owner may give.
  await expect(modal.locator(".invrow").first().getByLabel("Role").locator("option")).toHaveText(["Owner", "Admin", "User", "Client"]);
  await modal.getByRole("button", { name: "Create Client" }).click();

  const done = page.getByRole("dialog", { name: "Client Created" });
  // Two invites, one after another, each emailed: not instant.
  await expect(done).toContainText("2 invites sent. You can also share the invite links below", { timeout: 20_000 });
  const clientLink = await done.getByRole("textbox", { name: `Invite link for ${clientEmail}` }).inputValue();
  expect(clientLink).toContain("/invite/");
  await done.getByRole("button", { name: "Done" }).click();

  const { data: client } = await admin.from("clients").select("id").eq("agency_id", frank.agencyId).eq("name", "E2E Invite Client").single();
  // The User: staff, with this client.
  const { data: um } = await admin
    .from("memberships")
    .select("id, role, client_id, accepted_at")
    .eq("agency_id", frank.agencyId)
    .eq("user_id", await userIdOf(userEmail))
    .single();
  expect(um).toMatchObject({ role: "user", client_id: null, accepted_at: null });
  expect((await admin.from("staff_client_access").select("client_id").eq("membership_id", um!.id)).data).toEqual([{ client_id: client!.id }]);
  // The Client: tied to this client, names kept (title-cased).
  const { data: cm } = await admin
    .from("memberships")
    .select("role, client_id")
    .eq("agency_id", frank.agencyId)
    .eq("user_id", await userIdOf(clientEmail))
    .single();
  expect(cm).toEqual({ role: "user", client_id: client!.id });
  expect((await admin.from("users").select("first_name, last_name").eq("email", clientEmail).single()).data).toEqual({
    first_name: "Cleo",
    last_name: "Client",
  });

  // The Client follows the link: their names are there; they finish and land
  // as a client-side person (no Settings).
  const ctx = await browser.newContext();
  try {
    const cp = await ctx.newPage();
    await cp.goto(clientLink);
    await expect(cp.getByText("You've been invited to review E2E Invite Client's work.")).toBeVisible();
    await expect(cp.getByLabel("First name")).toHaveValue("Cleo");
    await expect(cp.getByLabel("Last name")).toHaveValue("Client");
    await cp.getByLabel("Designation").fill("Marketing Lead");
    await cp.getByLabel("Password").fill("E2e-Client-1234!");
    await cp.getByRole("button", { name: "Create account" }).click();
    await cp.waitForURL(/\/dashboard$/, { timeout: 20_000 });
    await expect(cp.getByRole("link", { name: "Settings" })).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});

test("an Owner lets an Admin invite: Admins, Users and Clients, never an Owner — the database agrees", async ({
  page,
  browser,
  frank,
}) => {
  test.setTimeout(120_000);
  const second = await seedAdmin(frank);
  await setStaffRole(frank, "owner");
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/settings/team`);
  await page.getByRole("button", { name: "Options for Second Admin" }).click();
  await page.getByRole("button", { name: "Let Them Invite People" }).click();
  await expect(page.getByRole("status")).toHaveText("Second Admin can now invite Admins, Users and Clients");
  await expect(page.locator(".crow", { hasText: second.email })).toContainText("Can invite");
  expect((await admin.from("memberships").select("can_invite").eq("id", second.membershipId).single()).data!.can_invite).toBe(true);

  const ctx = await browser.newContext();
  try {
    const ap = await ctx.newPage();
    await ap.goto(`${APP_URL}/login`);
    await ap.fill('input[type="email"]', second.email);
    await ap.fill('input[type="password"]', second.password);
    await ap.click('button[type="submit"]');
    await ap.waitForURL(`${APP_URL}/dashboard`, { timeout: 20_000 });
    await ap.goto(`${APP_URL}/settings/team`);
    await ap.getByRole("button", { name: "Invite Member" }).click();
    const modal = ap.getByRole("dialog", { name: "Invite Team Member" });
    await expect(modal.getByLabel("Role").locator("option")).toHaveText(["Admin", "User", "Client"]);
    const invitee = `e2e-by-admin-${Date.now()}@example.invalid`;
    await modal.getByLabel("First Name").fill("By");
    await modal.getByLabel("Last Name").fill("Admin");
    await modal.getByLabel("Email Address").fill(invitee);
    await modal.getByLabel("Role").selectOption("client");
    await modal.getByLabel("Their Client").selectOption({ label: "E2E Test Client" });
    await modal.getByRole("button", { name: "Send Invite" }).click();
    await expect(ap.getByRole("dialog", { name: "Invite Sent" })).toBeVisible();

    // Not an Owner, through the route…
    const owner = await ap.request.post(`${APP_URL}/api/team/invite`, {
      data: { agencyId: frank.agencyId, email: `e2e-no-${Date.now()}@example.invalid`, firstName: "N", lastName: "O", role: "owner" },
    });
    expect(owner.status()).toBe(403);
  } finally {
    await ctx.close();
  }

  // …nor straight at the database, nor switching anyone's invites on.
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  await c.auth.signInWithPassword({ email: second.email, password: second.password });
  // Someone with no other membership here, so it's the Owner rule that
  // refuses it (phase63's team-or-client rule would refuse a Client first).
  const outsiderEmail = `e2e-outsider-${Date.now()}@example.invalid`;
  const { data: outsider } = await admin.auth.admin.createUser({ email: outsiderEmail, email_confirm: true });
  await admin.from("users").insert({ id: outsider.user!.id, email: outsiderEmail, name: "Outsider" });
  const direct = await c
    .from("memberships")
    .insert({ agency_id: frank.agencyId, user_id: outsider.user!.id, role: "owner", invited_by: second.userId });
  expect(direct.error?.code).toBe("42501");
  // Not in the agency, so the fixture's sweep wouldn't find them.
  await admin.from("users").delete().eq("id", outsider.user!.id);
  await admin.auth.admin.deleteUser(outsider.user!.id);
  const self = await c.from("memberships").update({ can_invite: true }).eq("id", second.membershipId).select("id");
  expect(self.data ?? []).toHaveLength(0);

  // Switched off again: no button.
  await page.getByRole("button", { name: "Options for Second Admin" }).click();
  await page.getByRole("button", { name: "Stop Them Inviting People" }).click();
  await expect(page.getByRole("status")).toHaveText("Second Admin can no longer invite people");
  expect((await admin.from("memberships").select("can_invite").eq("id", second.membershipId).single()).data!.can_invite).toBe(false);
});

// The Client Team list went from the client form (phase45): the people
// invited as Client are who a review link offers, kept in step by the
// database, and names already on the list stay.
test("people invited as Client are who a review link offers, and drop off when removed", async ({ page, browser, frank }) => {
  test.setTimeout(90_000);
  await frank.createClientContact("Already Listed", "listed@example.com");
  await setStaffRole(frank, "owner");
  await frank.loginAsStaff(page);
  const email = `e2e-reviewer-${Date.now()}@example.invalid`;
  const res = await page.request.post(`${APP_URL}/api/team/invite`, {
    data: { agencyId: frank.agencyId, email, firstName: "rita", lastName: "reviewer", role: "client", clientIds: [frank.clientId] },
  });
  expect(res.status()).toBe(201);

  const token = await frank.createSharedLink();
  const ctx = await browser.newContext({ viewport: PHONE_VIEWPORT });
  try {
    const guest = await ctx.newPage();
    await guest.goto(`${APP_URL}/review/${token}`);
    await guest.waitForSelector(".m-top");
    // Invited, not yet accepted: already there, by the name they were given.
    await expect(guest.locator("select").first().locator("option")).toHaveText([
      "Who are you?",
      "Already Listed",
      "Rita Reviewer",
    ]);

    // Removed: off the list.
    await admin
      .from("memberships")
      .update({ removed_at: new Date().toISOString() })
      .eq("agency_id", frank.agencyId)
      .eq("user_id", await userIdOf(email));
    await guest.reload();
    await guest.waitForSelector(".m-top");
    await expect(guest.locator("select").first().locator("option")).toHaveText(["Who are you?", "Already Listed"]);
  } finally {
    await ctx.close();
  }
});
