import { test, expect, APP_URL } from "./fixtures";

// The header (direct instruction): no "Preview as", a working search for
// clients and projects, and Help in the bell's place.

test("search lists matching clients and projects, marked as such, and opens one", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/dashboard`);
  await expect(page.getByText("Preview as")).toHaveCount(0);

  // ⌘K jumps into search from anywhere.
  await page.keyboard.press("Meta+k");
  const box = page.getByRole("combobox", { name: "Search pages, clients and projects" });
  await expect(box).toBeFocused();
  await box.fill("e2e test");
  const results = page.getByRole("listbox", { name: "Search results" });
  const client = results.getByRole("option", { name: /E2E Test Client\s*Client$/ });
  const project = results.getByRole("option", { name: /E2E Test Project/ });
  await expect(client).toBeVisible();
  await expect(project).toContainText("Project");
  // A project shows its client.
  await expect(project).toContainText("E2E Test Client");

  // Arrow keys and Enter open the one chosen.
  await box.press("ArrowDown");
  await expect(project).toHaveAttribute("aria-selected", "true");
  await box.press("Enter");
  await page.waitForURL(`${APP_URL}/projects/${frank.projectId}`);

  // Nothing matching says so.
  await box.fill("zzqx");
  await expect(page.getByRole("listbox", { name: "Search results" })).toContainText("No page, client or project called that.");
});

test("search opens pages, and finds projects by their type", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  const box = page.getByRole("combobox", { name: "Search pages, clients and projects" });
  const results = page.getByRole("listbox", { name: "Search results" });

  // "Clients" opens the clients list, marked Page, first.
  await box.fill("Clients");
  const first = results.getByRole("option").first();
  await expect(first).toContainText("Clients");
  await expect(first.locator(".gsearch-kind")).toHaveText("Page");
  await box.press("Enter");
  await page.waitForURL(`${APP_URL}/dashboard`);

  // "planner" lists the Content Planner projects, with their client.
  await box.fill("planner");
  const project = results.getByRole("option", { name: /E2E Test Project/ });
  await expect(project).toContainText("E2E Test Client · Content Planner");
  await expect(project.locator(".gsearch-kind")).toHaveText("Project");

  // A client's Client Settings pages, and Settings' own.
  await box.fill("knowledge");
  // Knowledge's page is Discovery (direct instruction); its section still finds it.
  await expect(results.getByRole("option", { name: /Discovery\s*E2E Test Client · Client Settings/ })).toBeVisible();
  await expect(results.getByRole("option", { name: /Reference Material\s*Settings · Knowledge/ })).toBeVisible();
  await results.getByRole("option", { name: /Discovery\s*E2E Test Client · Client Settings/ }).click();
  await page.waitForURL(`${APP_URL}/clients/${frank.clientId}/settings/knowledge`);
});

test("a client's own people find no Settings pages, but their Knowledge", async ({ page, frank }) => {
  await frank.loginAsClient(page);
  await page.goto(`${APP_URL}/dashboard`);
  const box = page.getByRole("combobox", { name: "Search pages, clients and projects" });
  const results = page.getByRole("listbox", { name: "Search results" });
  await box.fill("knowledge");
  // Knowledge's page is Discovery (direct instruction); its section still finds it.
  await expect(results.getByRole("option", { name: /Discovery\s*E2E Test Client · Client Settings/ })).toBeVisible();
  await expect(results.getByRole("option", { name: /Settings · Knowledge/ })).toHaveCount(0);
});

test("Help opens from the header: topics, categories, articles and search", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/dashboard`);
  await page.getByRole("button", { name: "Help", exact: true }).click();
  const help = page.getByRole("complementary", { name: "Help" });
  await expect(help).toContainText("Explore help topics");

  // A topic opens its article; Back returns.
  await help.getByRole("button", { name: "Draft copy with Frank" }).click();
  await expect(help.getByRole("heading", { name: "Draft copy with Frank" })).toBeVisible();
  await help.getByRole("button", { name: "Back" }).click();
  await expect(help).toContainText("Help categories");

  // A category lists its articles, each of which opens.
  await help.getByRole("button", { name: "Clients and Client Settings" }).click();
  await help.getByRole("button", { name: /Connect a client's Instagram/ }).click();
  await expect(help.getByRole("heading", { name: "Two ways to connect" })).toBeVisible();
  await help.getByRole("button", { name: "Back" }).click();
  await help.getByRole("button", { name: "Back" }).click();

  // Search finds articles by what's in them.
  await help.getByRole("searchbox", { name: "Search help" }).fill("passcode");
  await expect(help.getByRole("button", { name: /Send posts to your client for review/ })).toBeVisible();

  await help.getByRole("button", { name: "Close help" }).click();
  await expect(help).toHaveCount(0);
});
