import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL, type Frank } from "./fixtures";

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
  await admin.from("users").insert({ id: data.user!.id, email, name });
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
  await page.getByRole("button", { name: "+ Invite People" }).click();
  const picker = page.locator("#ivExisting");
  await expect(picker).toBeVisible();
  // Joined team Users only, alphabetical: not the client's person from the
  // other client, nor an Owner, nor a pending invite, nor the Admin.
  await expect(picker.locator("option")).toHaveText(["No, someone new", "Aaron Teamwork", "Zoe Teamwork"]);

  await picker.selectOption({ label: "Aaron Teamwork" });
  await expect(page.locator("#ivEmail")).toHaveCount(0);
  await expect(page.locator(".modal")).toContainText("with no invite");
  await page.getByRole("button", { name: "Add to Client" }).click();
  // Back to the empty window, ready for the next person.
  const modal = page.locator(".scrim:not(.closing) .modal");
  await expect(modal.locator(".note")).toHaveText("Aaron Teamwork added to E2E Second Client.");
  await expect(picker).toHaveValue("");
  await expect(picker.locator("option")).toHaveText(["No, someone new", "Zoe Teamwork"]);
  await expect(modal.locator("#ivFirst")).toHaveValue("");
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
  await page.getByRole("button", { name: "+ Invite People" }).click();
  await expect(picker).toBeDisabled();
  await expect(picker.locator("option")).toHaveText(["Every User on your team has this client"]);

  // A new person's invite: its link, then Done comes back to the window.
  await page.fill("#ivFirst", "Nina");
  await page.fill("#ivLast", "New");
  await page.fill("#ivEmail", `e2e-add-new-${Date.now()}@example.invalid`);
  await page.selectOption("#ivRole", "client");
  await page.getByRole("button", { name: "Send Invite" }).click();
  await page.getByRole("dialog", { name: "Invite Sent" }).getByRole("button", { name: "Done" }).click();
  await expect(modal.locator(".note")).toHaveText("Invite sent to Nina New.");
  await expect(page.locator("#ivFirst")).toHaveValue("");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".scrim:not(.closing)")).toHaveCount(0);
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

  // An Admin without "Can invite", and a Client, can't add anyone.
  const staff = await session(frank.staffEmail, frank.staffPassword);
  expect((await add(staff, teamUser)).error?.message).toMatch(/can't add people/);
  const asClient = await session(frank.clientEmail, frank.clientPassword);
  expect((await add(asClient, teamUser)).error?.message).toMatch(/can't add people/);

  await admin.from("memberships").update({ can_invite: true }).eq("agency_id", frank.agencyId).eq("user_id", await userIdOf(frank.staffEmail));
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
