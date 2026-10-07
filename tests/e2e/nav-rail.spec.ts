import { test, expect, APP_URL } from "./fixtures";
import type { Page } from "@playwright/test";

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
  await expect(page.locator("#navClientSet")).toBeVisible();
  await expect.poll(() => railLinks(page)).toEqual([
    "Clients -> /dashboard",
    `E2E Test Client Settings -> /clients/${frank.clientId}/settings`,
  ]);

  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  await expect(page.getByRole("link", { name: "E2E Test Client Projects" })).toBeVisible();
  await expect.poll(() => railLinks(page)).toEqual([
    "Clients -> /dashboard",
    `E2E Test Client Projects -> /clients/${frank.clientId}`,
    `E2E Test Client Settings -> /clients/${frank.clientId}/settings`,
  ]);

  // The fixture's project is a Content Planner one.
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await expect(page.getByRole("link", { name: "Content Planner" })).toBeVisible();
  await expect.poll(() => railLinks(page)).toEqual([
    "Clients -> /dashboard",
    `E2E Test Client Projects -> /clients/${frank.clientId}`,
    `Content Planner -> /projects/${frank.projectId}`,
    `E2E Test Client Settings -> /clients/${frank.clientId}/settings`,
  ]);

  await page.getByRole("link", { name: "Content Planner" }).click();
  await page.waitForURL(`${APP_URL}/projects/${frank.projectId}`);
  await page.getByRole("link", { name: "E2E Test Client Projects" }).click();
  await page.waitForURL(`${APP_URL}/clients/${frank.clientId}`);
  // The client's Settings, named for it, opens on Client Details for staff.
  await page.getByRole("link", { name: "E2E Test Client Settings" }).click();
  await page.waitForURL(`${APP_URL}/clients/${frank.clientId}/settings/details`);
  await expect(page.getByRole("navigation", { name: "Client Settings sections" })).toContainText("People");
});

test("a client-side member gets the same rail, opening their Knowledge", async ({ page, frank }) => {
  await frank.loginAsClient(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await expect(page.getByRole("link", { name: "Content Planner" })).toBeVisible();
  await expect.poll(() => railLinks(page)).toEqual([
    "Clients -> /dashboard",
    `E2E Test Client Projects -> /clients/${frank.clientId}`,
    `Content Planner -> /projects/${frank.projectId}`,
    `E2E Test Client Settings -> /clients/${frank.clientId}/settings`,
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
  await expect(page.getByRole("menu").getByRole("menuitem")).toHaveText(["My Profile", "Settings", "Sign out"]);
  await page.getByRole("menu").getByRole("menuitem", { name: "Settings" }).click();
  await page.waitForURL(/\/settings\//);
  // Frank's logo goes back to the clients list.
  await page.locator(".corner-logo").click();
  await page.waitForURL(`${APP_URL}/dashboard`);
});

test("a client-side member on their projects list gets Client Settings but no Settings", async ({ page, frank }) => {
  await frank.loginAsClient(page);
  await page.goto(`${APP_URL}/clients/${frank.clientId}`);
  await page.waitForSelector(".clients, .empty");
  await expect.poll(() => railLinks(page)).toEqual([
    "Clients -> /dashboard",
    `E2E Test Client Settings -> /clients/${frank.clientId}/settings`,
  ]);
});
