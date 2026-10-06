import { test, expect, APP_URL } from "./fixtures";

// The header (direct instruction): no "Preview as", a working search for
// clients and projects, and Help in the bell's place.

test("search lists matching clients and projects, marked as such, and opens one", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/dashboard`);
  await expect(page.getByText("Preview as")).toHaveCount(0);

  // ⌘K jumps into search from anywhere.
  await page.keyboard.press("Meta+k");
  const box = page.getByRole("combobox", { name: "Search clients and projects" });
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
  await expect(page.getByRole("listbox", { name: "Search results" })).toContainText("No client or project called that.");
});

test("Help opens from the header: topics, categories, articles and search", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/dashboard`);
  await page.getByRole("button", { name: "Help", exact: true }).click();
  const help = page.getByRole("complementary", { name: "Help" });
  await expect(help).toContainText("Explore help topics");

  // A topic opens its article; Back returns.
  await help.getByRole("button", { name: "Write copy with Claude" }).click();
  await expect(help.getByRole("heading", { name: "Write copy with Claude" })).toBeVisible();
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
