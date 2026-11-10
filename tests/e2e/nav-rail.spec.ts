import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { test, expect, APP_URL } from "./fixtures";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function railLinks(page: Page) {
  const rail = page.getByRole("navigation", { name: "Main" });
  // Settings is staff-only and resolves a moment after the page — wait for
  // the rail to settle on its final set before reading it.
  await page.waitForTimeout(300);
  return rail.locator("a.rbtn").evaluateAll((links) =>
    links.map((a) => `${a.getAttribute("title")} -> ${new URL((a as HTMLAnchorElement).href).pathname}`),
  );
}

test("the rail follows where you are inside a client", async ({ page, frank }) => {
  await frank.loginAsStaff(page);

  await page.goto(`${APP_URL}/clients/${frank.clientId}`);
  await expect(page.locator("#navClient")).toBeVisible();
  // The client by name, with the buildings icon, on every page inside it
  // (direct instruction), as "<client> Projects" again.
  await expect.poll(() => railLinks(page)).toEqual([
    "Clients -> /dashboard",
    `E2E Test Client Projects -> /clients/${frank.clientId}`,
  ]);

  // On a project's table, its planner too, named for the project ("E2E Test
  // Project Planner", direct instruction), as the page you're on.
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  await expect(page.locator("#navClient")).toBeVisible();
  await expect.poll(() => railLinks(page)).toEqual([
    "Clients -> /dashboard",
    `E2E Test Client Projects -> /clients/${frank.clientId}`,
    `E2E Test Project Planner -> /projects/${frank.projectId}`,
  ]);
  await expect(page.getByRole("link", { name: "E2E Test Project Planner" })).toHaveAttribute("aria-current", "true");

  // The fixture's project is a Content Planner one.
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await expect(page.getByRole("link", { name: "E2E Test Project Planner" })).toBeVisible();
  await expect.poll(() => railLinks(page)).toEqual([
    "Clients -> /dashboard",
    `E2E Test Client Projects -> /clients/${frank.clientId}`,
    `E2E Test Project Planner -> /projects/${frank.projectId}`,
  ]);

  // A Project's reads "<project> Project".
  const other = await frank.createContinuousProject();
  const { data: otherRow } = await admin.from("projects").select("name").eq("id", other).single();
  const mem = (await admin.from("memberships").select("id").eq("user_id", (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id).eq("agency_id", frank.agencyId).single()).data!;
  await admin.from("project_access").insert({ membership_id: mem.id, project_id: other });
  await page.goto(`${APP_URL}/projects/${other}`);
  await expect(page.getByRole("link", { name: `${otherRow!.name} Project` })).toHaveAttribute("aria-current", "true", { timeout: 15_000 });
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);

  await page.getByRole("link", { name: "E2E Test Project Planner" }).click();
  await page.waitForURL(`${APP_URL}/projects/${frank.projectId}`);
  await page.locator("#navClient").click();
  await page.waitForURL(`${APP_URL}/clients/${frank.clientId}`);
  // The client's Settings, named for it, top right on its page (not the
  // rail), opens on Client Details for staff.
  await expect(page.locator(".rail").getByRole("link", { name: "E2E Test Client Settings" })).toHaveCount(0);
  await page.getByRole("link", { name: "E2E Test Client Settings" }).click();
  await page.waitForURL(`${APP_URL}/clients/${frank.clientId}/settings/details`);
  await expect(page.getByRole("navigation", { name: "Client Settings sections" })).toContainText("People");
});

test("a client-side member gets the same rail, opening their Knowledge", async ({ page, frank }) => {
  await frank.loginAsClient(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await expect(page.getByRole("link", { name: "E2E Test Project Planner" })).toBeVisible();
  await expect.poll(() => railLinks(page)).toEqual([
    "Clients -> /dashboard",
    `E2E Test Client Projects -> /clients/${frank.clientId}`,
    `E2E Test Project Planner -> /projects/${frank.projectId}`,
  ]);
  // Their Client Settings is Knowledge only; other pages send them there.
  await page.goto(`${APP_URL}/clients/${frank.clientId}/settings/details`);
  await page.waitForURL(`${APP_URL}/clients/${frank.clientId}/settings/knowledge`);
  const menu = page.getByRole("navigation", { name: "Client Settings sections" });
  await expect(menu).toContainText("Knowledge");
  await expect(menu).not.toContainText("People");
  // And no Settings in their picture's menu.
  await page.getByRole("button", { name: "Your account" }).click();
  await expect(page.getByRole("menuitem", { name: "My Profile" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Settings" })).toHaveCount(0);
});

test("outside a client the rail is just Clients, and Settings opens from your picture", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/dashboard`);
  await page.waitForSelector(".hbrand-agency");
  await expect.poll(() => railLinks(page)).toEqual(["Clients -> /dashboard"]);
  await expect(page.locator('a[href="/calendar"], a[href="/analytics"], a[href="/visibility"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Your account" }).click();
  await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText(["My Profile", "Workspace Settings", "Frank Tour", "Sign out"]);
  await page.getByRole("menu").getByRole("menuitem", { name: "Settings" }).click();
  await page.waitForURL(/\/settings\//);
  // Frank's logo goes back to the clients list.
  await page.locator(".corner-logo").click();
  await page.waitForURL(`${APP_URL}/dashboard`);
});

test("a client-side member on their projects list gets Client Settings, top right, but no Settings", async ({ page, frank }) => {
  await frank.loginAsClient(page);
  await page.goto(`${APP_URL}/clients/${frank.clientId}`);
  await page.waitForSelector(".clients, .empty");
  // The client by name, with the buildings icon, on every page inside it
  // (direct instruction), as "<client> Projects" again.
  await expect.poll(() => railLinks(page)).toEqual([
    "Clients -> /dashboard",
    `E2E Test Client Projects -> /clients/${frank.clientId}`,
  ]);
  // Their client's Settings from its page: their Knowledge.
  await page.getByRole("link", { name: "E2E Test Client Settings" }).click();
  await page.waitForURL(`${APP_URL}/clients/${frank.clientId}/settings/knowledge`);
});
