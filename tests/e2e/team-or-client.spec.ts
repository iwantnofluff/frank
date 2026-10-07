import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL, type Frank } from "./fixtures";

// Within an agency someone is on the team or at a client, never both
// (phase63): the invite says so plainly, and the database refuses it on
// every other path. A Client of two clients is still fine.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const userIdOf = async (email: string) => (await admin.from("users").select("id").eq("email", email).single()).data!.id as string;

async function asOwner(frank: Frank) {
  await admin.from("memberships").update({ role: "owner" }).eq("agency_id", frank.agencyId).eq("user_id", await userIdOf(frank.staffEmail));
}

test("an invite can't make someone both a team member and a Client", async ({ page, frank }) => {
  await asOwner(frank);
  await frank.loginAsStaff(page);
  const invite = (email: string, role: string) =>
    page.request.post(`${APP_URL}/api/team/invite`, {
      data: { agencyId: frank.agencyId, email, firstName: "Dee", lastName: "Dupe", role, clientIds: [frank.clientId] },
    });

  // A User first, then the same email as a Client of the same client.
  const user = `e2e-both-u-${Date.now()}@example.invalid`;
  expect((await invite(user, "user")).status()).toBe(201);
  const asClient = await invite(user, "client");
  expect(asClient.status()).toBe(409);
  expect((await asClient.json()).error).toBe(`${user} is on your team. Give them this client from its People instead.`);

  // A Client first, then the same email on the team.
  const client = `e2e-both-c-${Date.now()}@example.invalid`;
  expect((await invite(client, "client")).status()).toBe(201);
  const asUser = await invite(client, "user");
  expect(asUser.status()).toBe(409);
  expect((await asUser.json()).error).toBe(
    `${client} is a Client of E2E Test Client. To move them to your team, change their type in Team settings.`,
  );

  // Someone who has already joined as a Client, invited as an Admin.
  const joined = await invite(frank.clientEmail, "admin");
  expect(joined.status()).toBe(409);

  // Each stayed only what they were first.
  for (const [email, staff, clients] of [
    [user, 1, 0],
    [client, 0, 1],
    [frank.clientEmail, 0, 1],
  ] as const) {
    const { data } = await admin
      .from("memberships")
      .select("client_id")
      .eq("agency_id", frank.agencyId)
      .eq("user_id", await userIdOf(email))
      .is("removed_at", null);
    expect(data!.filter((m) => m.client_id === null)).toHaveLength(staff);
    expect(data!.filter((m) => m.client_id !== null)).toHaveLength(clients);
  }
});

test("the database refuses it on any path, but a Client of two clients is fine", async ({ frank }) => {
  const staffId = await userIdOf(frank.staffEmail);
  const clientId = await userIdOf(frank.clientEmail);
  const { data: second } = await admin.from("clients").insert({ agency_id: frank.agencyId, name: "E2E Second Client" }).select("id").single();

  const staffAsClient = await admin
    .from("memberships")
    .insert({ agency_id: frank.agencyId, user_id: staffId, role: "user", client_id: second!.id, accepted_at: new Date().toISOString() });
  expect(staffAsClient.error?.message).toMatch(/on your team, so they can't also be a Client/);

  const clientOnTeam = await admin
    .from("memberships")
    .insert({ agency_id: frank.agencyId, user_id: clientId, role: "user", accepted_at: new Date().toISOString() });
  expect(clientOnTeam.error?.message).toMatch(/a Client of E2E Test Client, so they can't also be on your team/);

  // A Client of a second client: allowed.
  const twoClients = await admin
    .from("memberships")
    .insert({ agency_id: frank.agencyId, user_id: clientId, role: "user", client_id: second!.id, accepted_at: new Date().toISOString() });
  expect(twoClients.error).toBeNull();

  // Deactivated on the team, they can be a Client; reactivating the team
  // membership is then refused.
  const { data: staffRow } = await admin.from("memberships").select("id").eq("agency_id", frank.agencyId).eq("user_id", staffId).single();
  await admin.from("memberships").update({ removed_at: new Date().toISOString() }).eq("id", staffRow!.id);
  const nowClient = await admin
    .from("memberships")
    .insert({ agency_id: frank.agencyId, user_id: staffId, role: "user", client_id: second!.id, accepted_at: new Date().toISOString() });
  expect(nowClient.error).toBeNull();
  const reactivate = await admin.from("memberships").update({ removed_at: null }).eq("id", staffRow!.id);
  expect(reactivate.error?.message).toMatch(/a Client of E2E Second Client/);
});
