import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL, TOUR_SEEN } from "./fixtures";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Project Settings → People (direct instruction): Add or Invite People opens
// the same window as Client Settings → People, for a teammate not on this
// client yet (given the whole client, decided directly) or someone new by
// email; whoever's added shows on the project straight away.
test("Add or Invite People in Project Settings adds a teammate and invites someone new", async ({ page, frank }) => {
  test.setTimeout(120_000);
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  // An Owner: Admins invite only with Can invite.
  await admin.from("memberships").update({ role: "owner" }).eq("user_id", staffId).eq("agency_id", frank.agencyId);
  const email = `e2e-project-add-${Date.now()}@example.invalid`;
  const { data: u } = await admin.auth.admin.createUser({ email, password: "E2e-Project-Add-1234!", email_confirm: true });
  const userId = u.user!.id;
  try {
    await admin.from("users").insert({ id: userId, email, name: "Pia Teammate", tour_seen_at: TOUR_SEEN });
    const { data: m } = await admin
      .from("memberships")
      .insert({ agency_id: frank.agencyId, user_id: userId, role: "user", accepted_at: new Date().toISOString() })
      .select("id")
      .single();

    await frank.loginAsStaff(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${APP_URL}/projects/${frank.projectId}`);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const people = page.getByRole("table", { name: "People on this project" });
    await expect(people).toBeVisible({ timeout: 20_000 });
    await expect(people.getByText("Pia Teammate")).toHaveCount(0);

    // A teammate not on this client: added, and on the project at once.
    await page.getByRole("button", { name: "Add or Invite People" }).click();
    const win = page.getByRole("dialog", { name: "Add or Invite People" });
    await win.getByLabel("A User on Your Team").selectOption({ label: "Pia Teammate" });
    await win.getByRole("button", { name: "Add to Client" }).click();
    await expect.poll(async () => (await admin.from("staff_client_access").select("client_id").eq("membership_id", m!.id)).data).toEqual([
      { client_id: frank.clientId },
    ]);
    await expect
      .poll(async () => ((await admin.from("project_access").select("project_id").eq("membership_id", m!.id)).data ?? []).map((r) => r.project_id))
      .toContain(frank.projectId);
    await win.getByRole("button", { name: "Cancel" }).click();
    await expect(people.getByText("Pia Teammate")).toBeVisible({ timeout: 15_000 });

    // Someone new, by email, as a Client of this client.
    const invited = `e2e-project-invite-${Date.now()}@example.invalid`;
    await page.getByRole("button", { name: "Add or Invite People" }).click();
    await win.getByLabel("First Name").fill("Nina");
    await win.getByLabel("Last Name").fill("Client");
    await win.getByLabel("Email Address").fill(invited);
    // Only a User or a Client from here.
    await expect(win.getByLabel("Role").locator("option")).toHaveText(["User", "Client"]);
    await win.getByLabel("Role").selectOption("client");
    await expect(win.getByLabel("Their Client")).toHaveValue(frank.clientId);
    await win.getByRole("button", { name: "Send Invite" }).click();
    await expect(page.getByRole("dialog", { name: "Invite Sent" })).toBeVisible({ timeout: 20_000 });
    // A Client of this client (a membership with the client on it), waiting
    // on their invite.
    const { data: invitedUser } = await admin.from("users").select("id").eq("email", invited).single();
    const { data: invitedMember } = await admin
      .from("memberships")
      .select("id, role, client_id, accepted_at")
      .eq("user_id", invitedUser!.id)
      .eq("agency_id", frank.agencyId)
      .single();
    expect(invitedMember).toMatchObject({ client_id: frank.clientId, accepted_at: null });
    expect((await admin.from("invites").select("id").eq("membership_id", invitedMember!.id)).data).toHaveLength(1);
  } finally {
    await admin.from("project_access").delete().in("membership_id", ((await admin.from("memberships").select("id").eq("user_id", userId)).data ?? []).map((r) => r.id));
    await admin.from("staff_client_access").delete().in("membership_id", ((await admin.from("memberships").select("id").eq("user_id", userId)).data ?? []).map((r) => r.id));
    await admin.from("memberships").delete().eq("user_id", userId);
    await admin.from("users").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
  }
});
