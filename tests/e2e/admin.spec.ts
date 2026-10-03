import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { test, expect, APP_URL, type Frank } from "./fixtures";

// The platform admin area (phase37) at admin.frank.localhost:3000 — the
// local shape of admin.beingfrank.app (lib/tenant.ts).

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ADMIN = "http://admin.frank.localhost:3000";
const PASSWORD = "E2e-Admin-Test-1234!";

// An admin-only account: on platform_admins, in no agency.
async function makePlatformAdmin() {
  const email = `e2e-platform-admin-${Date.now()}@example.invalid`;
  const { data } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  const id = data.user!.id;
  await admin.from("users").insert({ id, email, name: "E2E Platform Admin" });
  await admin.from("platform_admins").insert({ user_id: id });
  return {
    email,
    async cleanup() {
      await admin.from("platform_admins").delete().eq("user_id", id);
      await admin.from("invites").delete().eq("created_by", id);
      await admin.from("users").delete().eq("id", id);
      await admin.auth.admin.deleteUser(id);
    },
  };
}

async function signInAt(page: Page, base: string, email: string, password: string) {
  await page.goto(`${base}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
}

const staffSession = async (frank: Frank) => {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await c.auth.signInWithPassword({ email: frank.staffEmail, password: frank.staffPassword });
  return c;
};

test("the admin area lists every agency with its usage, for platform admins only", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const pa = await makePlatformAdmin();
  try {
    // An agency member isn't an admin.
    await signInAt(page, ADMIN, frank.staffEmail, frank.staffPassword);
    await expect(page.getByRole("heading", { name: "Not a platform admin" })).toBeVisible({ timeout: 20_000 });
    expect((await page.request.get(`${ADMIN}/api/admin/agencies`)).status()).toBe(403);
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL(`${ADMIN}/login`);

    // The admin area doesn't exist at any other address.
    expect((await page.request.get(`${APP_URL}/admin`)).status()).toBe(404);

    await page.goto(`${ADMIN}/login`);
    await expect(page.getByRole("heading", { name: "Frank Admin" })).toBeVisible();
    await signInAt(page, ADMIN, pa.email, PASSWORD);
    await page.waitForURL(`${ADMIN}/admin`, { timeout: 20_000 });
    const row = page.locator(".admintbl tr", { has: page.locator(`a[href="/admin/agencies/${frank.agencyId}"]`) });
    await expect(row).toContainText("E2E Test Agency");
    // Agency, Plan, Primary Owner, then 1 team member and 1 client, each of
    // the fixture's 50.
    await expect(row.locator("td").nth(1)).toContainText("Starter");
    await expect(row.locator("td").nth(3)).toHaveText("1 / 50");
    await expect(row.locator("td").nth(4)).toHaveText("1 / 50");
    await expect(row).toContainText("Active");
  } finally {
    await pa.cleanup();
  }
});

test("an admin creates an agency, and its Primary Owner is invited to its own address", async ({ page }) => {
  test.setTimeout(90_000);
  const pa = await makePlatformAdmin();
  const sub = `e2ec${Date.now().toString(36)}`;
  const ownerEmail = `e2e-owner-${Date.now()}@example.invalid`;
  try {
    await signInAt(page, ADMIN, pa.email, PASSWORD);
    await page.waitForURL(`${ADMIN}/admin`, { timeout: 20_000 });
    await page.getByRole("link", { name: "New Agency" }).click();
    await page.fill("#agName", "E2E Created Agency");
    // A reserved name is refused.
    await page.fill("#agSub", "admin");
    await page.fill("#agOwner", ownerEmail);
    await page.getByRole("button", { name: "Create Agency" }).click();
    await expect(page.locator(".autherr")).toContainText("isn't allowed");
    await page.fill("#agSub", sub);
    await page.getByRole("button", { name: "Create Agency" }).click();
    await expect(page.getByRole("heading", { name: "E2E Created Agency" })).toBeVisible({ timeout: 20_000 });

    const { data: agency } = await admin.from("agencies").select("id, subdomain").eq("subdomain", sub).single();
    const { data: owner } = await admin
      .from("memberships")
      .select("id, role, accepted_at, user_id")
      .eq("agency_id", agency!.id)
      .single();
    expect(owner!.role).toBe("primary_owner");
    expect(owner!.accepted_at).toBeNull();
    const { data: ownerUser } = await admin.from("users").select("email").eq("id", owner!.user_id).single();
    expect(ownerUser!.email).toBe(ownerEmail);
    const { data: invites } = await admin.from("invites").select("id").eq("membership_id", owner!.id);
    expect(invites).toHaveLength(1);

    // The list names its Primary Owner.
    await page.goto(`${ADMIN}/admin`);
    await expect(page.locator(".admintbl tr", { hasText: "E2E Created Agency" })).toContainText(ownerEmail);

    // Its address exists.
    await page.goto(`http://${sub}.frank.localhost:3000/login`);
    await expect(page.getByRole("heading", { name: "Hey, sign in to E2E Created Agency" })).toBeVisible();
  } finally {
    const { data: agency } = await admin.from("agencies").select("id").eq("subdomain", sub).maybeSingle();
    if (agency) {
      const { data: m } = await admin.from("memberships").select("id, user_id").eq("agency_id", agency.id);
      for (const row of m ?? []) await admin.from("invites").delete().eq("membership_id", row.id);
      await admin.from("memberships").delete().eq("agency_id", agency.id);
      await admin.from("agencies").delete().eq("id", agency.id);
      for (const row of m ?? []) {
        await admin.from("users").delete().eq("id", row.user_id);
        await admin.auth.admin.deleteUser(row.user_id);
      }
    }
    await pa.cleanup();
  }
});

test("limits come from the plan plus the admin override, are enforced, and pausing locks the agency", async ({ page, frank }) => {
  test.setTimeout(120_000);
  const pa = await makePlatformAdmin();
  try {
    await signInAt(page, ADMIN, pa.email, PASSWORD);
    await page.waitForURL(`${ADMIN}/admin`, { timeout: 20_000 });
    await page.goto(`${ADMIN}/admin/agencies/${frank.agencyId}`);
    // The fixture: Starter (3 clients, 5 members) with roomy extras on top.
    const members = page.locator(".srow", { hasText: "Team members" });
    await expect(members).toContainText("5 on Starter, plus 45 added");
    await expect(members).toContainText("50");
    // The address is the Owner's and the plan the agency's: neither is the
    // admin's to change, and the page doesn't explain the address any more.
    await expect(page.locator("#agAddress")).toHaveCount(0);
    await expect(page.locator("#agPlan")).toHaveCount(0);
    await expect(page.getByText("Account URL")).toHaveCount(0);
    const refused = await page.request.patch(`${ADMIN}/api/admin/agencies/${frank.agencyId}`, { data: { plan: "agency" } });
    expect(refused.status()).toBe(403);

    // No override, then Free: the plan's own limits, fixed.
    for (const id of ["#agXSeats", "#agXClients"]) await page.fill(id, "0");
    await page.getByRole("button", { name: "Save Override" }).click();
    // The list reloads after a change (every agency's usage, so not instant).
    await expect(page.getByText("Saved.")).toBeVisible({ timeout: 20_000 });
    await expect(members).toContainText("5 on Starter");
    // Free (the agency's choice, made here directly): its limits, fixed.
    await admin.from("agencies").update({ plan: "free" }).eq("id", frank.agencyId);
    await page.reload();
    await expect(page.locator(".srow", { hasText: "Active clients" })).toContainText("1 on Free", { timeout: 20_000 });
    const { data: limits } = await admin.from("agencies").select("plan, client_limit, seat_limit").eq("id", frank.agencyId).single();
    expect(limits).toEqual({ plan: "free", client_limit: 1, seat_limit: 2 });

    // The fixture already has its 1 client, so it can't grow.
    const staff = await staffSession(frank);
    const { error: clientError } = await staff.from("clients").insert({ agency_id: frank.agencyId, name: "One Too Many E2E" });
    expect(clientError?.message).toContain("client limit reached (1)");
    // An extra client from the override lets it.
    await page.fill("#agXClients", "1");
    await page.getByRole("button", { name: "Save Override" }).click();
    await expect(page.locator(".srow", { hasText: "Active clients" })).toContainText("1 on Free, plus 1 added", { timeout: 20_000 });
    expect((await admin.from("agencies").select("client_limit").eq("id", frank.agencyId).single()).data!.client_limit).toBe(2);

    // An agency paying by card: its plan isn't the admin's to change.
    await admin.from("agency_billing").insert({
      agency_id: frank.agencyId,
      paddle_customer_id: "ctm_e2e",
      paddle_subscription_id: `sub_e2e_admin_${frank.agencyId}`,
      status: "active",
    });
    await page.reload();
    await expect(page.getByText("paid by card through Paddle")).toBeVisible({ timeout: 20_000 });
    await admin.from("agency_billing").delete().eq("agency_id", frank.agencyId);
    await admin.from("agencies").update({ plan: "starter", extra_clients: 47, extra_seats: 45 }).eq("id", frank.agencyId);
    await page.reload();

    // Pause: nobody in the agency sees anything, and its review links stop.
    const token = await frank.createSharedLink();
    await page.getByRole("button", { name: "Pause Agency" }).click();
    await page.getByRole("dialog", { name: /^Pause / }).getByRole("button", { name: "Pause Agency" }).click();
    await expect(page.getByRole("button", { name: "Reactivate" })).toBeVisible();
    expect((await staff.from("clients").select("id").eq("agency_id", frank.agencyId)).data).toEqual([]);
    const review = await (await page.request.post(`${APP_URL}/api/shared-review`, { data: { token } })).json();
    expect(review.status).toBe("not_found");
    await admin.from("agencies").update({ subdomain: `e2ep${Date.now().toString(36)}` }).eq("id", frank.agencyId);
    const { data: ag } = await admin.from("agencies").select("subdomain").eq("id", frank.agencyId).single();
    await page.goto(`http://${ag!.subdomain}.frank.localhost:3000/login`);
    await expect(page.getByRole("heading", { name: "This workspace is paused" })).toBeVisible();

    // Reactivate: everything is back.
    await page.goto(`${ADMIN}/admin/agencies/${frank.agencyId}`);
    await page.getByRole("button", { name: "Reactivate" }).click();
    await expect(page.getByRole("button", { name: "Pause Agency" })).toBeVisible();
    expect((await staff.from("clients").select("id").eq("agency_id", frank.agencyId)).data!.length).toBe(1);
  } finally {
    await admin.from("agency_billing").delete().eq("agency_id", frank.agencyId);
    await admin.from("agencies").update({ suspended_at: null, plan: "starter", extra_clients: 47, extra_seats: 45 }).eq("id", frank.agencyId);
    await pa.cleanup();
  }
});

test("forgot password sends a link that sets a new password", async ({ page, frank }) => {
  test.setTimeout(60_000);
  await page.goto(`${APP_URL}/login`);
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await page.fill('input[type="email"]', frank.staffEmail);
  await page.getByRole("button", { name: "Send the link" }).click();
  await expect(page.getByText("a link to set a new password is on its way")).toBeVisible();

  // The email goes nowhere for a test address; the same kind of link,
  // made the way the route makes it.
  const { data } = await admin.auth.admin.generateLink({ type: "recovery", email: frank.staffEmail });
  await page.goto(`${APP_URL}/reset-password?token_hash=${encodeURIComponent(data.properties!.hashed_token)}`);
  await page.fill('input[type="password"]', "short");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.locator(".autherr")).toContainText("at least 8");
  await page.fill('input[type="password"]', "E2e-New-Password-987!");
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("heading", { name: "Password changed" })).toBeVisible();

  // The new password signs in; the link can't be used twice.
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  expect((await c.auth.signInWithPassword({ email: frank.staffEmail, password: "E2e-New-Password-987!" })).error).toBeNull();
  await page.goto(`${APP_URL}/reset-password?token_hash=${encodeURIComponent(data.properties!.hashed_token)}`);
  await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();
});
