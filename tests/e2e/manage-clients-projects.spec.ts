import { test, expect } from "./fixtures";

// Rename + archive/unarchive for clients and projects. "Delete" in the
// original ask turned out to mean archive, not real removal — there's no
// delete permission on either table, and archived_at already existed on
// both, unused until this. See docs/parity-gaps.md.

test("rename and archive/unarchive a client from the dashboard", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto("/dashboard");
  await page.waitForSelector(".crow:not(.head)");

  await page.getByRole("button", { name: "Open E2E Test Client's profile" }).click();
  const profile = page.getByRole("dialog", { name: "E2E Test Client" });
  await profile.getByRole("button", { name: "Edit", exact: true }).click();
  await page.fill("#cName", "E2E Renamed Client");
  await profile.getByRole("button", { name: "Save" }).click();
  // Saved in place: the profile shows the new name, then closes.
  await expect(page.getByRole("dialog", { name: "E2E Renamed Client" }).locator(".profclient")).toContainText(
    "E2E Renamed Client",
  );
  await page.getByRole("dialog", { name: "E2E Renamed Client" }).getByRole("button", { name: "Done" }).click();
  await expect(page.locator(".crow", { hasText: "E2E Renamed Client" })).toBeVisible();

  await page.getByRole("button", { name: "Open E2E Renamed Client's profile" }).click();
  await page.getByRole("dialog", { name: "E2E Renamed Client" }).getByRole("button", { name: "Archive" }).click();
  await expect(page.locator(".crow", { hasText: "E2E Renamed Client" })).toHaveCount(0);

  await page.click('button.chip:has-text("Archived")');
  const archivedRow = page.locator(".crow", { hasText: "E2E Renamed Client" });
  await expect(archivedRow).toBeVisible();

  await page.getByRole("button", { name: "Open E2E Renamed Client's profile" }).click();
  await page.getByRole("dialog", { name: "E2E Renamed Client" }).getByRole("button", { name: "Unarchive" }).click();
  await page.click('button.chip:has-text("Active")');
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

  await page.getByRole("button", { name: "Open Client Modal E2E's profile" }).click();
  const profile = page.getByRole("dialog", { name: "Client Modal E2E" });
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
  await page.goto(`/clients/${frank.clientId}`);
  await page.waitForSelector(".crow:not(.head)");

  await page.getByRole("button", { name: "Open E2E Test Project's profile" }).click();
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
  await expect(page.locator(".crow", { hasText: "E2E Renamed Project" })).toContainText(
    "Paid Campaign",
  );

  await page.getByRole("button", { name: "Open E2E Renamed Project's profile" }).click();
  const renamed = page.getByRole("dialog", { name: "E2E Renamed Project" });
  await expect(renamed.getByLabel("Type")).toHaveValue("Paid Campaign");
  await expect(renamed.getByLabel("Type").locator("option")).toHaveCount(4);
  await expect(renamed.getByLabel("Due date")).toHaveValue("2026-12-15");
  await expect(renamed.getByLabel("Description")).toHaveValue("Festive season social");
  await renamed.getByRole("button", { name: "Cancel" }).click();

  // The project count lives in the chips now, not beside the title.
  const activeChip = page.locator("button.chip", { hasText: "Active" });
  const archivedChip = page.locator("button.chip", { hasText: "Archived" });
  await expect(activeChip).toHaveText("Active (1)");
  await expect(archivedChip).toHaveText("Archived (0)");

  await page.getByRole("button", { name: "Open E2E Renamed Project's profile" }).click();
  await renamed.getByRole("button", { name: "Archive" }).click();
  await expect(page.locator(".crow", { hasText: "E2E Renamed Project" })).toHaveCount(0);
  await expect(activeChip).toHaveText("Active (0)");
  await expect(archivedChip).toHaveText("Archived (1)");

  await page.click('button.chip:has-text("Archived")');
  const archivedRow = page.locator(".crow", { hasText: "E2E Renamed Project" });
  await expect(archivedRow).toBeVisible();

  await page.getByRole("button", { name: "Open E2E Renamed Project's profile" }).click();
  await renamed.getByRole("button", { name: "Unarchive" }).click();
  await page.click('button.chip:has-text("Active")');
  await expect(page.locator(".crow", { hasText: "E2E Renamed Project" })).toBeVisible();
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

test("a client's profile opens without navigating the row, and Escape closes it", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto("/dashboard");
  await page.waitForSelector(".crow:not(.head)");

  await page.getByRole("button", { name: "Open E2E Test Client's profile" }).click();
  const profile = page.getByRole("dialog", { name: "E2E Test Client" });
  await expect(profile).toContainText("E2E Test Project");
  await page.keyboard.press("Escape");
  await expect(profile).toHaveCount(0);

  // The row itself is a <Link> — the button must never navigate it away.
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("a real client-role session has no row actions menu anywhere", async ({ page, frank }) => {
  await frank.loginAsClient(page);
  await page.goto(`/clients/${frank.clientId}`);
  await page.waitForSelector(".crow:not(.head)");
  await expect(page.locator(".vdots")).toHaveCount(0);
});
