import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { test, expect, APP_URL, type Frank } from "./fixtures";

// Settings → Your Plan → Plans, and the admin area applying a request
// (phase38). Payments aren't connected yet: choosing a plan asks Frank.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ADMIN = "http://admin.frank.localhost:3000";
const PASSWORD = "E2e-Admin-Test-1234!";

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
      await admin.from("users").delete().eq("id", id);
      await admin.auth.admin.deleteUser(id);
    },
  };
}

const card = (page: Page, name: string) => page.locator(".plancard", { has: page.locator(".plancard-h b", { hasText: new RegExp(`^${name}$`) }) });

async function staffRole(frank: Frank, role: string) {
  const id = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  await admin.from("memberships").update({ role }).eq("agency_id", frank.agencyId).eq("user_id", id);
}

test("an Admin asks Frank for Enterprise, and the platform admin applies it", async ({ page, browser, frank }) => {
  test.setTimeout(120_000);
  // No admin override, so the plan's own limits show (phase42).
  await admin.from("agencies").update({ extra_clients: 0, extra_seats: 0 }).eq("id", frank.agencyId);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/settings/plan`);
  await page.waitForURL(/\/settings\/plan\/plans$/);
  await expect(page.locator(".panel-h", { hasText: "Current plan: Starter" })).toBeVisible();
  await expect(card(page, "Starter")).toContainText("Active");
  await expect(card(page, "Starter").getByRole("button", { name: "Current plan" })).toBeDisabled();

  // Annual shows the yearly price per month.
  await expect(card(page, "Growth")).toContainText("$149");
  await page.getByRole("button", { name: /^Annual/ }).click();
  await expect(card(page, "Growth")).toContainText("$119");
  await expect(card(page, "Growth")).toContainText("billed yearly");

  // Paid plans are bought by card, even from a plan Frank set by hand
  // (decided directly, revised 3 Oct 2026): Growth is a checkout, not a
  // request. Enterprise is still a conversation.
  await expect(page.getByText("Your plan is arranged with Frank")).toHaveCount(0);
  await card(page, "Enterprise").getByRole("button", { name: "Talk to us" }).click();
  const dialog = page.getByRole("dialog", { name: "Move to Enterprise?" });
  await expect(dialog).toContainText("E2E, this asks Frank to move E2E Test Agency to Enterprise.");
  await dialog.getByRole("button", { name: "Send Request" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".note")).toContainText(/You.ve asked to move to Enterprise, billed annual/);
  await expect(card(page, "Enterprise")).toContainText("Requested");
  // One request at a time; buying by card isn't a request, so stays open.
  await expect(card(page, "Free").getByRole("button", { name: "Choose Free" })).toBeDisabled();
  await expect(card(page, "Growth").getByRole("button", { name: "Choose Growth" })).toBeEnabled();

  const { data: req } = await admin
    .from("plan_requests")
    .select("requested_plan, billing_interval, handled_at")
    .eq("agency_id", frank.agencyId)
    .single();
  expect(req).toEqual({ requested_plan: "enterprise", billing_interval: "annual", handled_at: null });

  // The platform admin sees it, and applies it.
  const pa = await makePlatformAdmin();
  const ctx = await browser.newContext();
  try {
    const ap = await ctx.newPage();
    await ap.goto(`${ADMIN}/login`);
    await ap.fill('input[type="email"]', pa.email);
    await ap.fill('input[type="password"]', PASSWORD);
    await ap.click('button[type="submit"]');
    await ap.waitForURL(`${ADMIN}/admin`, { timeout: 20_000 });
    // The Overview flags it…
    await expect(
      ap.getByRole("region", { name: "Plan requests", exact: true }).locator(".srow", { hasText: "E2E Test Agency" }),
    ).toContainText("Wants Enterprise");
    // …and so does the agencies list.
    await ap.goto(`${ADMIN}/admin/agencies`);
    const row = ap.locator(".admintbl tr", { has: ap.locator(`a[href="/admin/agencies/${frank.agencyId}"]`) });
    await expect(row).toContainText("Wants Enterprise");
    await row.getByRole("link", { name: "E2E Test Agency" }).click();
    await ap.locator(".panel", { hasText: "Plan request" }).getByRole("button", { name: "Apply" }).click();
    await expect(ap.locator(".panel", { hasText: "Plan request" })).toHaveCount(0, { timeout: 20_000 });
  } finally {
    await ctx.close();
    await pa.cleanup();
  }

  const { data: agency } = await admin.from("agencies").select("plan, client_limit, seat_limit").eq("id", frank.agencyId).single();
  expect(agency).toEqual({ plan: "enterprise", client_limit: null, seat_limit: null });
  await page.reload();
  await expect(card(page, "Enterprise")).toContainText("Active");
  await expect(page.locator(".note")).toHaveCount(0);
});

test("a User sees the plans but can't ask for one, and the database agrees", async ({ page, frank }) => {
  await staffRole(frank, "user");
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/settings/plan/plans`);
  await expect(page.getByText("Only Admins and Owners can change the plan.")).toBeVisible();
  await expect(card(page, "Growth").getByRole("button", { name: "Choose Growth" })).toBeDisabled();

  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  await c.auth.signInWithPassword({ email: frank.staffEmail, password: frank.staffPassword });
  const { data: me } = await c.auth.getUser();
  const { error } = await c
    .from("plan_requests")
    .insert({ agency_id: frank.agencyId, requested_plan: "agency", requested_by: me.user!.id });
  expect(error?.code).toBe("42501");
});

test("the admin area can decline a request, and shows a plan's limits fixed", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await admin.from("agencies").update({ extra_clients: 0, extra_seats: 0 }).eq("id", frank.agencyId);
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  await admin.from("plan_requests").insert({ agency_id: frank.agencyId, requested_plan: "agency", requested_by: staffId });
  const pa = await makePlatformAdmin();
  try {
    await page.goto(`${ADMIN}/login`);
    await page.fill('input[type="email"]', pa.email);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(`${ADMIN}/admin`, { timeout: 20_000 });
    await page.goto(`${ADMIN}/admin/agencies/${frank.agencyId}`);
    await page.locator(".panel", { hasText: "Plan request" }).getByRole("button", { name: "Decline" }).click();
    // The list reloads after the change (every agency's usage, so not instant).
    await expect(page.locator(".panel", { hasText: "Plan request" })).toHaveCount(0, { timeout: 20_000 });
    const { data: req } = await admin.from("plan_requests").select("outcome").eq("agency_id", frank.agencyId).single();
    expect(req!.outcome).toBe("declined");
    expect((await admin.from("agencies").select("plan").eq("id", frank.agencyId).single()).data!.plan).toBe("starter");

    // Agency (the agency's choice, made here directly): its limits, shown
    // fixed, with unlimited members; there's no plan control for the admin.
    await expect(page.locator("#agPlan")).toHaveCount(0);
    await admin.from("agencies").update({ plan: "agency" }).eq("id", frank.agencyId);
    await page.reload();
    await expect(page.locator(".srow", { hasText: "Team members" })).toContainText("Unlimited on Agency", { timeout: 20_000 });
    const { data: agency } = await admin.from("agencies").select("plan, seat_limit, client_limit").eq("id", frank.agencyId).single();
    expect(agency).toEqual({ plan: "agency", seat_limit: null, client_limit: 25 });
    await page.goto(`${ADMIN}/admin/agencies`);
    const row = page.locator(".admintbl tr", { has: page.locator(`a[href="/admin/agencies/${frank.agencyId}"]`) });
    // Agency, Plan, Primary Owner, Members.
    await expect(row.locator("td").nth(1)).toContainText("Agency");
    await expect(row.locator("td").nth(3)).toHaveText("1 / Unlimited");
  } finally {
    await pa.cleanup();
  }
});
