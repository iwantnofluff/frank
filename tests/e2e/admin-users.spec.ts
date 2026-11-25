import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { test, expect, APP_URL, APP_PORT, TOUR_SEEN } from "./fixtures";

// The admin area's Users (decided directly, 4 Oct 2026): everyone on Frank,
// a person's page, and each agency's People. View-only.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ADMIN = `http://admin.frank.localhost:${APP_PORT}`;
const PASSWORD = "E2e-Admin-Test-1234!";

async function makePlatformAdmin() {
  const email = `e2e-platform-admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;
  const { data } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  const id = data.user!.id;
  await admin.from("users").insert({ tour_seen_at: TOUR_SEEN, id, email, name: "E2E Platform Admin" });
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

test("the admin finds a person, sees their role, clients, projects and pending invite, and the agency's people", async ({
  page,
  frank,
}) => {
  test.setTimeout(90_000);
  // An invited User on the fixture client, on one of its two projects.
  const second = await frank.createContinuousProject();
  const email = `e2e-admin-view-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.invalid`;
  const { data: created } = await admin.auth.admin.createUser({ email, email_confirm: true });
  await admin.from("users").insert({ tour_seen_at: TOUR_SEEN, id: created.user!.id, email, name: "Vera Viewed", designation: "Copywriter" });
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  const { data: m } = await admin
    .from("memberships")
    .insert({ agency_id: frank.agencyId, user_id: created.user!.id, role: "user", accepted_at: null, invited_by: staffId, invited_at: new Date().toISOString() })
    .select("id")
    .single();
  await admin.from("staff_client_access").insert({ membership_id: m!.id, client_id: frank.clientId });
  await admin.from("project_access").delete().eq("membership_id", m!.id).eq("project_id", second);
  await admin.from("invites").insert({
    membership_id: m!.id,
    token_hash: `e2e-${Date.now()}`,
    expires_at: new Date(Date.now() + 48 * 3600_000).toISOString(),
    created_by: staffId,
  });

  const pa = await makePlatformAdmin();
  try {
    await signIn(page, pa.email);
    await page.getByRole("navigation", { name: "Admin sections" }).getByRole("link", { name: "Users" }).click();
    await page.waitForURL(`${ADMIN}/admin/users`);
    await page.locator(".admintbl-row").first().waitFor();
    await page.screenshot({ path: `${process.env.SHOT_DIR ?? "test-results"}/admin-users.png`, animations: "disabled" });
    await page.getByLabel("Search users").fill(email);
    const row = page.locator(".admintbl-row", { hasText: email });
    await expect(page.locator(".admintbl-row")).toHaveCount(1);
    // Workspace and role in their own columns (direct instruction).
    await expect(row.locator("td").nth(2)).toHaveText("E2E Test Agency");
    await expect(row.locator("td").nth(3)).toHaveText("User · Invited");
    await expect(row).toContainText("Never");

    // Anywhere on the row opens them.
    await row.locator("td").nth(1).click();
    await page.waitForURL(`${ADMIN}/admin/users/${created.user!.id}`, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Vera Viewed" })).toBeVisible();
    await expect(page.locator(".panel").first()).toContainText("Copywriter");
    const here = page.locator(".adminperson", { hasText: "E2E Test Agency" });
    await expect(here.locator(".panel-h")).toContainText("User");
    await expect(here.locator(".panel-h")).toContainText("Invited");
    await expect(here).toContainText("by E2E Staff");
    await expect(here).toContainText("Not yet");
    await expect(here.locator(".srow", { hasText: "Invite link" })).toContainText("expires");
    await expect(here.locator(".srow", { hasText: "Clients" })).toContainText("E2E Test Client");
    const projects = here.locator(".srow", { hasText: "Projects" });
    await expect(projects).toContainText("E2E Test Client · E2E Test Project");
    await expect(projects).not.toContainText("E2E Continuous Project");
    await page.screenshot({ path: `${process.env.SHOT_DIR ?? "test-results"}/admin-person.png`, animations: "disabled" });

    // The agency's People: most senior first, Clients last.
    await here.getByRole("link", { name: "E2E Test Agency" }).click();
    await page.waitForURL(`${ADMIN}/admin/agencies/${frank.agencyId}`, { timeout: 20_000 });
    await page.getByRole("tab", { name: "People" }).click();
    const people = page.locator(".adminpeople .admintbl-row");
    await expect(people).toHaveCount(3);
    await expect(people.nth(0)).toContainText("E2E Staff");
    await expect(people.nth(0)).toContainText("All clients");
    await expect(people.nth(1)).toContainText("Vera Viewed");
    await expect(people.nth(2)).toContainText("Client");
    await page.screenshot({ path: `${process.env.SHOT_DIR ?? "test-results"}/admin-agency-people.png`, animations: "disabled" });
  } finally {
    await pa.cleanup();
  }
});

// Multi-select filters (direct instruction): workspace, role, status and
// last sign-in, held on one membership together, cleared in one go.
test("the admin filters Users by workspace, role and status", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const { data: agency } = await admin.from("agencies").select("name, subdomain").eq("id", frank.agencyId).single();
  const named = agency!.subdomain ? `${agency!.name} (${agency!.subdomain})` : agency!.name;
  const pa = await makePlatformAdmin();
  try {
    await signIn(page, pa.email);
    await page.goto(`${ADMIN}/admin/users`);
    const rows = page.locator(".admintbl-row");
    await rows.first().waitFor();
    const total = await rows.count();

    // Just the fixture's workspace: All cleared, then it ticked.
    await page.getByRole("button", { name: "Workspace" }).click();
    const list = page.getByRole("dialog", { name: "Workspaces" });
    await list.getByRole("checkbox", { name: "All Workspaces" }).click();
    await expect(page.getByRole("button", { name: "Workspace" })).toHaveText("No Workspaces");
    await expect(rows).toHaveCount(0);
    await list.getByRole("checkbox", { name: named }).click();
    await list.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("button", { name: "Workspace" })).toHaveText(named);
    await expect(rows).toHaveCount(2);
    await expect(page.locator(".adminhead .sub")).toContainText(", 2 shown.");

    // Clients only there.
    await page.getByRole("button", { name: "Role" }).click();
    const roles = page.getByRole("dialog", { name: "Roles" });
    await roles.getByRole("checkbox", { name: "All Roles" }).click();
    await roles.getByRole("checkbox", { name: "Client" }).click();
    await roles.getByRole("button", { name: "Done" }).click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(frank.clientEmail);

    // A status nobody there has.
    await page.getByRole("button", { name: "Status" }).click();
    const statuses = page.getByRole("dialog", { name: "Statuses" });
    await statuses.getByRole("checkbox", { name: "All Statuses" }).click();
    await statuses.getByRole("checkbox", { name: "Deactivated" }).click();
    await statuses.getByRole("button", { name: "Done" }).click();
    await expect(rows).toHaveCount(0);

    await page.getByRole("button", { name: "Clear Filters" }).click();
    await expect(page.getByRole("button", { name: "Workspace" })).toHaveText("All Workspaces");
    await expect(rows).toHaveCount(total);
    await expect(page.getByRole("button", { name: "Clear Filters" })).toHaveCount(0);
  } finally {
    await pa.cleanup();
  }
});

test("only a platform admin can read people across Frank", async ({ page, frank }) => {
  // On an agency's own address the admin API isn't there at all…
  await frank.loginAsStaff(page);
  expect((await page.request.get(`${APP_URL}/api/admin/users`)).status()).toBe(404);
  // …and on the admin address it sends anyone else to sign in (or refuses
  // them), never the list.
  const res = await page.request.get(`${ADMIN}/api/admin/users`, { maxRedirects: 0 });
  expect([307, 401, 403]).toContain(res.status());
  expect(await res.text()).not.toContain(frank.staffEmail);
});
