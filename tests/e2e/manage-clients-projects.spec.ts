import { test, expect } from "./fixtures";

// Rename + archive/unarchive for clients and projects. "Delete" in the
// original ask turned out to mean archive, not real removal — there's no
// delete permission on either table, and archived_at already existed on
// both, unused until this. See docs/parity-gaps.md.

test("rename and archive/unarchive a client from the dashboard", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto("/dashboard");
  await page.waitForSelector(".crow:not(.head)");

  // The row's arrow went (direct instruction): the client's page, then
  // its Settings in the rail.
  await page.locator(".crow", { hasText: "E2E Test Client" }).click();
  await page.getByRole("link", { name: "E2E Test Client Settings" }).click();
  await page.waitForURL(/\/settings\/details$/);
  const details = page.locator(".setmain");
  await details.getByRole("button", { name: "Edit", exact: true }).click();
  await page.fill("#cName", "E2E Renamed Client");
  await details.getByRole("button", { name: "Save" }).click();
  // Saved in place: the page shows the new name.
  await expect(details.locator(".profclient")).toContainText("E2E Renamed Client");

  await details.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(details.getByRole("button", { name: "Unarchive" })).toBeVisible();
  await page.goto("/dashboard");
  // It was the only client, so Active is empty now.
  await expect(page.locator("button.chip", { hasText: "Archived" })).toHaveText("Archived (1)");
  await expect(page.locator(".crow", { hasText: "E2E Renamed Client" })).toHaveCount(0);
  await page.click('button.chip:has-text("Archived")');
  await expect(page.locator(".crow", { hasText: "E2E Renamed Client" })).toBeVisible();

  // The row's arrow went (direct instruction): the client's page, then
  // its Settings in the rail.
  await page.locator(".crow", { hasText: "E2E Renamed Client" }).click();
  await page.getByRole("link", { name: "E2E Renamed Client Settings" }).click();
  await page.waitForURL(/\/settings\/details$/);
  await page.locator(".setmain").getByRole("button", { name: "Unarchive" }).click();
  await expect(page.locator(".setmain").getByRole("button", { name: "Archive", exact: true })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.locator(".crow", { hasText: "E2E Renamed Client" })).toBeVisible();
});

test("New Client takes an industry, and the Client Profile edits it in place; no separate Client Team list", async ({
  page,
  frank,
}) => {
  await frank.loginAsStaff(page);
  await page.goto("/dashboard");
  await page.waitForSelector(".crow:not(.head)");

  await page.click('button:has-text("New Client")');
  // The Client Team list went (phase45): inviting someone as Client covers it.
  await expect(page.getByText("Client Team")).toHaveCount(0);
  await page.fill("#cName", "Client Modal E2E");
  await page.fill("#cInd", "D2C beauty");
  await page.click('button:has-text("Create Client")');
  await expect(page.locator(".scrim")).toHaveCount(0);
  await expect(page.locator(".crow", { hasText: "Client Modal E2E" })).toBeVisible();

  // The row's arrow went (direct instruction): the client's page, then
  // its Settings in the rail.
  await page.locator(".crow", { hasText: "Client Modal E2E" }).click();
  await page.getByRole("link", { name: "Client Modal E2E Settings" }).click();
  await page.waitForURL(/\/settings\/details$/);
  const profile = page.locator(".setmain");
  await expect(profile.locator(".profclient")).toContainText("D2C beauty");
  await profile.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(profile.locator("#cName")).toHaveValue("Client Modal E2E");
  await expect(profile.locator("#cInd")).toHaveValue("D2C beauty");
  await page.fill("#cInd", "Skincare");
  await profile.getByRole("button", { name: "Save" }).click();
  await expect(profile.locator(".profclient")).toContainText("Skincare");
});

test("edit (name, type and details) and archive/unarchive a project from its profile", async ({
  page,
  frank,
}) => {
  await frank.loginAsStaff(page);
  // The profile opens from the project's own page (direct instruction: the
  // arrow on its row went).
  const openSettings = async () => {
    await page.goto(`/projects/${frank.projectId}`);
    await page.getByRole("button", { name: "Project options" }).click();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
  };
  await openSettings();
  const modal = page.getByRole("dialog", { name: "E2E Test Project" });
  // The fixture project has no type: it shows as "—" rather than silently
  // becoming the first option, and only Content Planner types are offered.
  await expect(modal.getByLabel("Type")).toHaveValue("");
  await expect(modal.getByLabel("Type").locator("option")).toHaveText([
    "—",
    "Social Media",
    "Paid Campaign",
    "Launch",
    "Other",
  ]);
  await modal.getByLabel("Project name").fill("E2E Renamed Project");
  await modal.getByLabel("Type").selectOption("Paid Campaign");
  await modal.getByLabel("Due date").fill("2026-12-15");
  await modal.getByLabel("Description").fill("Festive season social");
  await modal.getByRole("button", { name: "Save" }).click();
  await expect(modal).toHaveCount(0);
  await page.goto(`/clients/${frank.clientId}`);
  await expect(page.locator(".crow", { hasText: "E2E Renamed Project" })).toContainText(
    "Paid Campaign",
  );
  // No arrow left on the row.
  await expect(page.locator(".crow:not(.head)").first().locator("button")).toHaveCount(0);

  await openSettings();
  const renamed = page.getByRole("dialog", { name: "E2E Renamed Project" });
  await expect(renamed.getByLabel("Type")).toHaveValue("Paid Campaign");
  await expect(renamed.getByLabel("Type").locator("option")).toHaveCount(4);
  await expect(renamed.getByLabel("Due date")).toHaveValue("2026-12-15");
  await expect(renamed.getByLabel("Description")).toHaveValue("Festive season social");
  await renamed.getByRole("button", { name: "Archive" }).click();
  await expect(renamed).toHaveCount(0);

  // The project count lives in the chips.
  await page.goto(`/clients/${frank.clientId}`);
  const activeChip = page.locator("button.chip", { hasText: "Active" });
  const archivedChip = page.locator("button.chip", { hasText: "Archived" });
  await expect(activeChip).toHaveText("Active (0)");
  await expect(archivedChip).toHaveText("Archived (1)");
  await page.click('button.chip:has-text("Archived")');
  await expect(page.locator(".crow", { hasText: "E2E Renamed Project" })).toBeVisible();

  await openSettings();
  await renamed.getByRole("button", { name: "Unarchive" }).click();
  await page.goto(`/clients/${frank.clientId}`);
  await expect(page.locator(".crow", { hasText: "E2E Renamed Project" })).toBeVisible();
  await expect(activeChip).toHaveText("Active (1)");
});

test("the project's own detail page has no row actions menu next to its title", async ({
  page,
  frank,
}) => {
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".h1");
  await expect(page.locator(".vdots")).toHaveCount(0);
});

// The expand arrow went from client and project rows (direct instruction):
// a row just opens the client or project, and Client Settings is in the
// rail inside it.
test("client rows have no arrow; the row opens the client, its Settings in the rail", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto("/dashboard");
  const row = page.locator(".crow:not(.head)", { hasText: "E2E Test Client" });
  await expect(row).toBeVisible();
  await expect(row.locator("button")).toHaveCount(0);
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/clients/${frank.clientId}$`));
  await page.getByRole("link", { name: "E2E Test Client Settings" }).click();
  await expect(page).toHaveURL(new RegExp(`/clients/${frank.clientId}/settings/details$`));
  await expect(page.locator(".setmain")).toContainText("E2E Test Client");
});

test("a real client-role session has no row actions menu anywhere", async ({ page, frank }) => {
  await frank.loginAsClient(page);
  await page.goto(`/clients/${frank.clientId}`);
  await page.waitForSelector(".crow:not(.head)");
  await expect(page.locator(".vdots")).toHaveCount(0);
});
