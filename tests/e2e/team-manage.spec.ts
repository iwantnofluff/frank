import { createHash, randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";
import type { Browser } from "@playwright/test";
import { test, expect, APP_URL, type Frank } from "./fixtures";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const PASSWORD = "E2e-Member-1234!";

async function staffUserId(frank: Frank) {
  return (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!
    .id as string;
}

async function setStaffRole(frank: Frank, role: string) {
  const { error } = await admin
    .from("memberships")
    .update({ role })
    .eq("agency_id", frank.agencyId)
    .eq("user_id", await staffUserId(frank));
  if (error) throw error;
}

// Addresses stay on .invalid so the fixture's teardown sweep picks them up.
async function seedMember(
  frank: Frank,
  opts: { role: string; name: string; pending?: boolean },
) {
  const email = `e2e-member-${Date.now()}-${randomBytes(3).toString("hex")}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: opts.pending ? undefined : PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  const userId = data.user.id;
  await admin.from("users").insert({ id: userId, email, name: opts.name });
  const { data: m, error: mErr } = await admin
    .from("memberships")
    .insert({
      agency_id: frank.agencyId,
      user_id: userId,
      role: opts.role,
      ...(opts.pending ? { accepted_at: null } : {}),
    })
    .select("id")
    .single();
  if (mErr) throw mErr;
  return { email, userId, membershipId: m.id as string };
}

async function deleteAccount(userId: string) {
  await admin.from("users").delete().eq("id", userId);
  await admin.auth.admin.deleteUser(userId);
}

async function signInAs(browser: Browser, email: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${APP_URL}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  return { context, page };
}

async function openMenu(page: import("@playwright/test").Page, name: string) {
  await page.getByRole("button", { name: `Options for ${name}` }).click();
}

test("deactivating blocks sign-in with a clear message, and reactivating restores it", async ({
  page,
  browser,
  frank,
}) => {
  await setStaffRole(frank, "owner");
  const member = await seedMember(frank, { role: "admin", name: "Dee Activated" });
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/settings/team`);

  await openMenu(page, "Dee Activated");
  await page.getByRole("button", { name: "Deactivate" }).click();
  const row = page.locator(".crow", { hasText: member.email });
  await expect(row).toContainText("Deactivated");
  await expect(page.getByRole("status")).toHaveText("Dee Activated deactivated");
  const { data: m } = await admin
    .from("memberships")
    .select("removed_at")
    .eq("id", member.membershipId)
    .single();
  expect(m!.removed_at).not.toBeNull();

  const blocked = await signInAs(browser, member.email);
  await blocked.page.waitForURL(/\/access-removed/, { timeout: 15000 });
  await expect(blocked.page.getByRole("heading", { name: "Access removed" })).toBeVisible();
  await expect(blocked.page.locator(".sub")).toContainText("Your access to E2E Test Agency on Frank");
  // Signed out, not just shown a page: the app itself sends them back to sign in.
  await blocked.page.goto(`${APP_URL}/dashboard`);
  await blocked.page.waitForURL(/\/login/, { timeout: 15000 });
  await blocked.context.close();

  await openMenu(page, "Dee Activated");
  await page.getByRole("button", { name: "Reactivate" }).click();
  await expect(row).toContainText("Active");

  const back = await signInAs(browser, member.email);
  await back.page.waitForURL(`${APP_URL}/dashboard`, { timeout: 15000 });
  await back.context.close();
});

test("someone already signed in is shown the message on their next page load", async ({
  page,
  browser,
  frank,
}) => {
  await setStaffRole(frank, "owner");
  const member = await seedMember(frank, { role: "user", name: "Mid Session" });
  const session = await signInAs(browser, member.email);
  await session.page.waitForURL(`${APP_URL}/dashboard`, { timeout: 15000 });

  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/settings/team`);
  await openMenu(page, "Mid Session");
  await page.getByRole("button", { name: "Deactivate" }).click();
  await expect(page.locator(".crow", { hasText: member.email })).toContainText("Deactivated");

  await session.page.reload();
  await session.page.waitForURL(/\/access-removed/, { timeout: 15000 });
  await session.context.close();
});

test("removing a member asks first, then drops them from the team but keeps their name on past work", async ({
  page,
  frank,
}) => {
  await setStaffRole(frank, "owner");
  const member = await seedMember(frank, { role: "user", name: "Gone Soon" });
  await admin.from("staff_client_access").insert({ membership_id: member.membershipId, client_id: frank.clientId });
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/settings/team`);

  await openMenu(page, "Gone Soon");
  await page.getByRole("button", { name: "Remove from Team" }).click();
  const confirm = page.getByRole("dialog", { name: "Remove from team?" });
  // Addressed to whoever is signed in (the staff fixture, first name "E2E").
  await expect(confirm.locator(".sub")).toHaveText(/^E2E, Gone Soon will lose all access to E2E Test Agency/);
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".crow", { hasText: member.email })).toBeVisible();

  await openMenu(page, "Gone Soon");
  await page.getByRole("button", { name: "Remove from Team" }).click();
  await confirm.getByRole("button", { name: "Remove from Team" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.locator(".crow", { hasText: member.email })).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("Gone Soon removed from the team");

  const { data: m } = await admin
    .from("memberships")
    .select("removed_at, removed_permanently_at")
    .eq("id", member.membershipId)
    .single();
  expect(m!.removed_at).not.toBeNull();
  expect(m!.removed_permanently_at).not.toBeNull();
  const { data: grants } = await admin
    .from("staff_client_access")
    .select("id")
    .eq("membership_id", member.membershipId);
  expect(grants).toHaveLength(0);

  // Their name still resolves for a remaining member, through RLS — the same
  // lookup comments use to show who wrote what.
  const staff = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } },
  );
  await staff.auth.signInWithPassword({ email: frank.staffEmail, password: frank.staffPassword });
  const { data: seen } = await staff.from("users").select("name").eq("id", member.userId);
  expect(seen).toEqual([{ name: "Gone Soon" }]);
});

test("revoking a pending invite removes it and kills the link", async ({ page, frank }) => {
  await setStaffRole(frank, "owner");
  const member = await seedMember(frank, { role: "user", name: "Not Yet", pending: true });
  const token = randomBytes(32).toString("base64url");
  await admin.from("invites").insert({
    membership_id: member.membershipId,
    token_hash: createHash("sha256").update(token).digest("hex"),
    expires_at: new Date(Date.now() + 3600e3).toISOString(),
    created_by: await staffUserId(frank),
  });
  try {
    await frank.loginAsStaff(page);
    await page.goto(`${APP_URL}/settings/team`);
    const row = page.locator(".crow", { hasText: member.email });
    await expect(row).toContainText("Invited");

    await openMenu(page, "Not Yet");
    await expect(page.getByRole("button", { name: "Deactivate" })).toHaveCount(0);
    await page.getByRole("button", { name: "Revoke Invite" }).click();
    await expect(row).toHaveCount(0);

    await page.goto(`${APP_URL}/invite/${token}`);
    await expect(page.getByRole("heading", { name: "This invite link isn't valid" })).toBeVisible();
  } finally {
    await deleteAccount(member.userId);
  }
});

test("everyone gets a menu only on the people below them (phase49)", async ({
  page,
  frank,
}) => {
  const po = await seedMember(frank, { role: "primary_owner", name: "The Primary" });
  await seedMember(frank, { role: "owner", name: "Fellow Owner" });
  await seedMember(frank, { role: "admin", name: "Some Admin" });
  await seedMember(frank, { role: "user", name: "Some User" });

  await setStaffRole(frank, "owner");
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/settings/team`);
  await expect(page.locator(".crow", { hasText: po.email })).toContainText("Primary Owner");
  await expect(page.getByRole("button", { name: "Options for The Primary" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Options for E2E Staff" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Options for Fellow Owner" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Options for Some User" })).toBeVisible();
  // An Owner gives Admin or User, never Owner.
  await openMenu(page, "Some Admin");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Edit Some Admin" }).getByLabel("Role").locator("option")).toHaveText([
    "Admin",
    "User",
  ]);
  await page.getByRole("dialog", { name: "Edit Some Admin" }).getByRole("button", { name: "Cancel" }).click();

  // An Admin: Users only, and only Edit for an active one.
  await setStaffRole(frank, "admin");
  await page.reload();
  await expect(page.locator(".crow", { hasText: po.email })).toBeVisible();
  await expect(page.getByRole("button", { name: "Options for Some Admin" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Options for Fellow Owner" })).toHaveCount(0);
  await openMenu(page, "Some User");
  await expect(page.locator(".colpop .cpr")).toHaveText(["Edit"]);
});

test("inviting someone who was deactivated points to Reactivate instead", async ({ page, frank }) => {
  await setStaffRole(frank, "owner");
  const member = await seedMember(frank, { role: "user", name: "Was Here" });
  await admin
    .from("memberships")
    .update({ removed_at: new Date().toISOString() })
    .eq("id", member.membershipId);
  await frank.loginAsStaff(page);

  const res = await page.request.post(`${APP_URL}/api/team/invite`, {
    data: { agencyId: frank.agencyId, email: member.email, role: "user", clientIds: [] },
  });
  expect(res.status()).toBe(409);
  expect((await res.json()).error).toBe(
    `${member.email} was deactivated — reactivate them from the Team list instead`,
  );
});

test("an Owner edits a User's clients and role; the Clients column and Clients page follow", async ({
  page,
  frank,
}) => {
  await setStaffRole(frank, "owner");
  const { data: second } = await admin
    .from("clients")
    .insert({ agency_id: frank.agencyId, name: "Second Client" })
    .select("id")
    .single();
  const member = await seedMember(frank, { role: "user", name: "Edit Me" });
  await admin.from("staff_client_access").insert({ membership_id: member.membershipId, client_id: frank.clientId });

  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/settings/team`);
  const row = page.locator(".crow", { hasText: member.email });
  await expect(row).toContainText("E2E Test Client");
  await expect(page.locator(".crow", { hasText: frank.staffEmail })).toContainText("All clients");

  await openMenu(page, "Edit Me");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Edit Edit Me" });
  await expect(modal.getByRole("checkbox", { name: "E2E Test Client" })).toHaveAttribute("aria-checked", "true");
  await expect(modal.getByRole("button", { name: "Save" })).toBeDisabled();
  await modal.getByRole("checkbox", { name: "E2E Test Client" }).click();
  await modal.getByRole("checkbox", { name: "Second Client" }).click();
  await modal.getByRole("button", { name: "Save" }).click();
  await expect(modal).toHaveCount(0);
  await expect(row).toContainText("Second Client");
  await expect(row).not.toContainText("E2E Test Client");

  const { data: grants } = await admin
    .from("staff_client_access")
    .select("client_id")
    .eq("membership_id", member.membershipId);
  expect(grants).toEqual([{ client_id: second!.id }]);

  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: "Clients" }).click();
  await expect(page.locator(".crow", { hasText: "Second Client" })).toContainText("Edit Me");
  await expect(page.locator(".crow", { hasText: "E2E Test Client" })).toContainText("No Users");
  // Beside the team's Users, the client's own people (direct instruction).
  await expect(page.locator(".crow.head").first()).toContainText("Agency");
  await expect(page.locator(".crow", { hasText: "E2E Test Client" })).toContainText("E2E Client User");
  await expect(page.locator(".vdots")).toHaveCount(0);
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: "Users" }).click();

  await openMenu(page, "Edit Me");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await modal.getByLabel("Role").selectOption("admin");
  await expect(modal.getByRole("group", { name: "Client access" })).toHaveCount(0);
  await modal.getByRole("button", { name: "Save" }).click();
  await expect(modal).toHaveCount(0);
  await expect(row).toContainText("Admin");
  await expect(row).toContainText("All clients");
  const { data: after } = await admin
    .from("staff_client_access")
    .select("id")
    .eq("membership_id", member.membershipId);
  expect(after).toHaveLength(0);
});

// Since phase49 an Admin manages the Users below them: their clients, not
// their role (User is the only one below Admin).
test("an Admin sees who has which clients, and changes a User's", async ({ page, frank }) => {
  const member = await seedMember(frank, { role: "user", name: "Read Only" });
  await admin.from("staff_client_access").insert({ membership_id: member.membershipId, client_id: frank.clientId });
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/settings/team`);
  await expect(page.locator(".crow", { hasText: member.email })).toContainText("E2E Test Client");
  await expect(page.getByRole("button", { name: "Invite Member" })).toHaveCount(0);
  await openMenu(page, "Read Only");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Edit Read Only" });
  await expect(modal.getByLabel("Role").locator("option")).toHaveText(["User"]);
  await modal.getByRole("checkbox", { name: "E2E Test Client" }).click();
  await modal.getByRole("button", { name: "Save" }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.locator(".crow", { hasText: member.email })).toContainText("No clients");
  await admin.from("staff_client_access").insert({ membership_id: member.membershipId, client_id: frank.clientId });
  await page.reload();
  await page.getByRole("navigation", { name: "Settings sections" }).getByRole("link", { name: "Clients" }).click();
  await expect(page.locator(".crow", { hasText: "E2E Test Client" })).toContainText("Read Only");
});

// One place on the team per person (phase76, reported directly: someone was
// listed twice). A second active team membership is refused, however it's
// made: inviting again says so plainly.
test("someone already on the team can't be given a second place on it", async ({ page, frank }) => {
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  const second = await admin.from("memberships").insert({ agency_id: frank.agencyId, user_id: staffId, role: "user", client_id: null }).select("id");
  expect(second.error?.code).toBe("23505");

  // An Owner, who can invite.
  await admin.from("memberships").update({ role: "owner" }).eq("agency_id", frank.agencyId).eq("user_id", staffId).is("client_id", null);
  await frank.loginAsStaff(page);
  const res = await page.request.post(`${APP_URL}/api/team/invite`, {
    data: { agencyId: frank.agencyId, email: frank.staffEmail, role: "user", clientIds: [] },
  });
  expect(res.status()).toBe(409);
  expect((await res.json()).error).toContain("already on the team");
});

// Under "Invited" (direct instruction): whether the person's link still works.
test("a pending invite says until when its link works, or that it's expired", async ({ page, frank }) => {
  test.setTimeout(120_000);
  await setStaffRole(frank, "owner");
  const a = await seedMember(frank, { role: "user", name: "Fresh Invite", pending: true });
  const b = await seedMember(frank, { role: "admin", name: "Old Invite", pending: true });
  const me = await staffUserId(frank);
  for (const [m, hours] of [[a, 40], [b, -60]] as const) {
    await admin.from("invites").insert({ membership_id: m.membershipId, token_hash: createHash("sha256").update(randomBytes(32)).digest("hex"), expires_at: new Date(Date.now() + hours * 3600e3).toISOString(), created_by: me });
  }
  try {
    await frank.loginAsStaff(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(APP_URL + "/settings/team");
    await expect(page.locator(".crow", { hasText: "Old Invite" }).locator(".invnote")).toContainText(/^Link expired .+\. Resend it$/, { timeout: 20_000 });
    await expect(page.locator(".crow", { hasText: "Fresh Invite" }).locator(".invnote")).toContainText(/^Link works until /);
  } finally {
    await deleteAccount(a.userId); await deleteAccount(b.userId);
  }
});
