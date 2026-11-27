import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL, type Frank, TOUR_SEEN } from "./fixtures";

// Giving a team User another client from that client's People (phase59/62):
// picked in the invite window, given it straight away with no invite. Only
// the team's Users: a client's own people are never picked from another
// client's. The database holds the same line.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const userIdOf = async (email: string) => (await admin.from("users").select("id").eq("email", email).single()).data!.id as string;

async function session(email: string, password: string) {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  await c.auth.signInWithPassword({ email, password });
  return c;
}

async function seedMember(frank: Frank, role: string, name: string, opts: { clientId?: string; pending?: boolean } = {}) {
  const email = `e2e-add-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.invalid`;
  const { data } = await admin.auth.admin.createUser({ email, email_confirm: true });
  await admin.from("users").insert({ tour_seen_at: TOUR_SEEN, id: data.user!.id, email, name });
  await admin.from("memberships").insert({
    agency_id: frank.agencyId,
    user_id: data.user!.id,
    role,
    client_id: opts.clientId ?? null,
    accepted_at: opts.pending ? null : new Date().toISOString(),
  });
  return data.user!.id as string;
}

async function secondClient(frank: Frank) {
  const { data: c } = await admin.from("clients").insert({ agency_id: frank.agencyId, name: "E2E Second Client" }).select("id").single();
  const { data: ps } = await admin
    .from("projects")
    .insert([
      { client_id: c!.id, name: "Second Planner", delivery: "scheduled" },
      { client_id: c!.id, name: "Second Launch", delivery: "scheduled" },
    ])
    .select("id, name");
  return { clientId: c!.id as string, projects: ps! as { id: string; name: string }[] };
}

test("an inviting Admin gives team Users this client, alphabetically listed, one after another", async ({ page, frank }) => {
  test.setTimeout(150_000);
  const two = await secondClient(frank);
  await admin.from("memberships").update({ can_invite: true }).eq("agency_id", frank.agencyId).eq("user_id", await userIdOf(frank.staffEmail));
  const zoe = await seedMember(frank, "user", "Zoe Teamwork");
  await seedMember(frank, "user", "Aaron Teamwork");
  await seedMember(frank, "owner", "Olive Owner");
  await seedMember(frank, "user", "Pending Person", { pending: true });

  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/clients/${two.clientId}/settings/people`);
  await page.getByRole("button", { name: "+ Add or Invite People" }).click();
  const picker = page.locator("#ivExisting");
  await expect(picker).toBeVisible();
  // Joined team Users only, alphabetical: not the client's person from the
  // other client, nor an Owner, nor a pending invite, nor the Admin.
  await expect(picker.locator("option")).toHaveText(["Choose someone", "Aaron Teamwork", "Zoe Teamwork"]);
  // Someone new can be invited from here too, as from a project (direct
  // instruction).
  await expect(page.locator("#ivFirst")).toBeVisible();
  await expect(page.locator(".modal")).toContainText("Or invite someone new by email below");

  await picker.selectOption({ label: "Aaron Teamwork" });
  await expect(page.locator("#ivEmail")).toHaveCount(0);
  await expect(page.locator(".modal")).toContainText("with no invite");
  await page.getByRole("button", { name: "Add to Client" }).click();
  // Back to the empty window, ready for the next person.
  const modal = page.locator(".scrim:not(.closing) .modal");
  await expect(modal.locator(".note")).toHaveText("Aaron Teamwork added to E2E Second Client.");
  await expect(picker).toHaveValue("");
  await expect(picker.locator("option")).toHaveText(["Choose someone", "Zoe Teamwork"]);
  const people = page.locator(".profperson");
  await expect(people.filter({ hasText: "Aaron Teamwork" })).toContainText("User");
  await expect(people.filter({ hasText: "Aaron Teamwork" })).not.toContainText("Invited");
  const { data: invites } = await admin.from("invites").select("id").eq("agency_id", frank.agencyId);
  expect(invites).toEqual([]);

  // Zoe, on one of the two projects only.
  await picker.selectOption({ label: "Zoe Teamwork" });
  await expect(page.locator(".modal #ivProjects")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  const staffSession = await session(frank.staffEmail, frank.staffPassword);
  const { error } = await staffSession.rpc("add_person_to_client", {
    p_user_id: zoe,
    p_client_id: two.clientId,
    p_project_ids: [two.projects[0].id],
  });
  expect(error).toBeNull();
  const { data: zoeMembership } = await admin.from("memberships").select("id").eq("user_id", zoe).single();
  const { data: grant } = await admin.from("staff_client_access").select("client_id").eq("membership_id", zoeMembership!.id);
  expect(grant).toEqual([{ client_id: two.clientId }]);
  const { data: access } = await admin.from("project_access").select("project_id").eq("membership_id", zoeMembership!.id);
  expect(access).toEqual([{ project_id: two.projects[0].id }]);

  // Nobody left to add: the field still shows, and says so.
  await page.reload();
  await page.getByRole("button", { name: "+ Add or Invite People" }).click();
  await expect(picker).toBeDisabled();
  await expect(picker.locator("option")).toHaveText(["Every User on your team has this client"]);
  // Nobody chosen and no one new, nothing sent.
  await page.getByRole("button", { name: "Send Invite" }).click();
  await expect(modal.locator(".autherr")).toHaveText("Enter their first and last name");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".scrim:not(.closing)")).toHaveCount(0);
});

// Client Settings → People invites someone new too, as a project's Settings
// does (direct instruction): this client only, with its projects to pick.
test("Add or Invite People in Client Settings invites someone new to chosen projects", async ({ page, frank }) => {
  test.setTimeout(120_000);
  const two = await secondClient(frank);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/clients/${two.clientId}/settings/people`);
  await page.getByRole("button", { name: "+ Add or Invite People" }).click();
  const win = page.getByRole("dialog", { name: "Add or Invite People" });
  const invited = `e2e-client-invite-${Date.now()}@example.invalid`;
  await win.getByLabel("First Name").fill("Cara");
  await win.getByLabel("Last Name").fill("Client");
  await win.getByLabel("Email Address").fill(invited);
  // Only a User or a Client from here, and no other client to pick.
  await expect(win.getByLabel("Role").locator("option")).toHaveText(["User", "Client"]);
  await win.getByLabel("Role").selectOption("client");
  await expect(win.getByLabel("Their Client")).toHaveCount(0);
  await expect(win.getByText("Client Access")).toHaveCount(0);
  await expect(win.locator(".iv-fixed")).toHaveCount(0);
  // Its projects to choose from: all but Second Planner.
  await win.locator("#ivProjects").click();
  await page.getByRole("dialog", { name: "Projects" }).getByRole("checkbox", { name: "Second Planner" }).click();
  await expect(win.locator("#ivProjects")).toHaveText("Second Launch");
  await win.locator("#ivProjects").click();
  await win.getByRole("button", { name: "Send Invite" }).click();
  await expect(page.getByRole("dialog", { name: "Invite Sent" })).toBeVisible({ timeout: 20_000 });

  const { data: invitedUser } = await admin.from("users").select("id").eq("email", invited).single();
  const { data: member } = await admin
    .from("memberships")
    .select("id, role, client_id, accepted_at")
    .eq("user_id", invitedUser!.id)
    .eq("agency_id", frank.agencyId)
    .single();
  // A Client is a "user" membership with the client on it.
  expect(member).toMatchObject({ role: "user", client_id: two.clientId, accepted_at: null });
  expect((await admin.from("invites").select("id").eq("membership_id", member!.id)).data).toHaveLength(1);
  const { data: access } = await admin.from("project_access").select("project_id").eq("membership_id", member!.id);
  expect(access).toEqual([{ project_id: two.projects.find((x) => x.name === "Second Launch")!.id }]);
});

// The New Client window picks from the team rather than inviting (direct
// instruction: invites are Workspace Settings → Team's alone).
test("New Client gives the client to team Users picked from a dropdown, and invites nobody", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await admin.from("memberships").update({ role: "owner" }).eq("agency_id", frank.agencyId).eq("user_id", await userIdOf(frank.staffEmail));
  const zoe = await seedMember(frank, "user", "Zoe Teamwork");
  await seedMember(frank, "user", "Aaron Teamwork");
  await seedMember(frank, "admin", "Ada Admin");
  await seedMember(frank, "user", "Pending Person", { pending: true });

  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/dashboard`);
  await page.getByRole("button", { name: "New Client" }).click();
  const modal = page.getByRole("dialog", { name: "New Client" });
  await modal.locator("#cName").fill("E2E Picked Client");
  await expect(modal.getByRole("button", { name: "+ Invite someone" })).toHaveCount(0);
  await expect(modal.getByLabel("Email")).toHaveCount(0);
  const pick = modal.getByLabel("Add someone from your team");
  // Joined Users only, alphabetical: not an Admin (who sees every client), nor a pending invite.
  await expect(pick.locator("option")).toHaveText(["Add someone from your team…", "Aaron Teamwork", "Zoe Teamwork"]);
  await pick.selectOption({ label: "Zoe Teamwork" });
  await expect(modal.locator(".ncteam-who")).toContainText("Zoe Teamwork");
  await expect(pick.locator("option")).toHaveText(["Add someone from your team…", "Aaron Teamwork"]);
  await modal.getByRole("button", { name: "Create Client" }).click();
  await expect(modal).toHaveCount(0, { timeout: 20_000 });

  const { data: client } = await admin.from("clients").select("id").eq("agency_id", frank.agencyId).eq("name", "E2E Picked Client").single();
  const { data: zm } = await admin.from("memberships").select("id").eq("agency_id", frank.agencyId).eq("user_id", zoe).single();
  expect((await admin.from("staff_client_access").select("client_id").eq("membership_id", zm!.id)).data).toEqual([{ client_id: client!.id }]);
  expect((await admin.from("invites").select("id").eq("agency_id", frank.agencyId)).data).toEqual([]);
});

// One person can still be a Client on two clients, by being invited to
// each; the app reads them as a Client on both (useMyMembership).
test("a Client invited to two clients sees both, as a Client", async ({ page, frank }) => {
  const two = await secondClient(frank);
  await admin.from("memberships").insert({
    agency_id: frank.agencyId,
    user_id: await userIdOf(frank.clientEmail),
    client_id: two.clientId,
    role: "user",
    accepted_at: new Date().toISOString(),
  });

  await frank.loginAsClient(page);
  await expect(page.getByText("E2E Second Client", { exact: true })).toBeVisible();
  await expect(page.getByText("E2E Test Client", { exact: true })).toBeVisible();
  for (const id of [frank.clientId, two.clientId]) {
    await page.goto(`${APP_URL}/clients/${id}`);
    // The Client's own wording, not the team's: they're still a Client.
    await expect(page.locator(".sub").first()).toHaveText("Pick a project to see what is scheduled.");
  }
});

test("the database refuses anyone who can't invite, and anyone who isn't a team User", async ({ frank }) => {
  const two = await secondClient(frank);
  const clientUser = await userIdOf(frank.clientEmail);
  const teamUser = await seedMember(frank, "user", "Tess Teamwork");
  const owner = await seedMember(frank, "owner", "Olive Owner");
  const pending = await seedMember(frank, "user", "Pending Person", { pending: true });
  const add = (c: Awaited<ReturnType<typeof session>>, userId: string) =>
    c.rpc("add_person_to_client", { p_user_id: userId, p_client_id: two.clientId });

  // A Client can't add anyone; every Admin can (phase163).
  const staff = await session(frank.staffEmail, frank.staffPassword);
  const asClient = await session(frank.clientEmail, frank.clientPassword);
  expect((await add(asClient, teamUser)).error?.message).toMatch(/can't add people/);
  // Another client's person: never from here.
  expect((await add(staff, clientUser)).error?.message).toMatch(/Only Users on your team/);
  expect((await add(staff, owner)).error?.message).toMatch(/Owners and Admins already see every client/);
  expect((await add(staff, pending)).error?.message).toMatch(/Only Users on your team/);

  // Nothing was written by any of those.
  const { data: rows } = await admin.from("memberships").select("id").eq("client_id", two.clientId);
  expect(rows).toEqual([]);
  const { data: grants } = await admin.from("staff_client_access").select("id").eq("client_id", two.clientId);
  expect(grants).toEqual([]);
});
