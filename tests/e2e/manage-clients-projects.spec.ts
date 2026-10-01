import { test, expect } from "./fixtures";

// Rename + archive/unarchive for clients and projects. "Delete" in the
// original ask turned out to mean archive, not real removal — there's no
// delete permission on either table, and archived_at already existed on
// both, unused until this. See docs/parity-gaps.md.

test("rename and archive/unarchive a client from the dashboard", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto("/dashboard");
  await page.waitForSelector(".crow:not(.head)");

  const row = page.locator(".crow", { hasText: "E2E Test Client" });
  await row.locator(".vdots").click();
  await page.click('.colpop button:has-text("Edit")');
  await page.fill("#cName", "E2E Renamed Client");
  await page.click('button:has-text("Save")');
  await expect(page.locator(".crow", { hasText: "E2E Renamed Client" })).toBeVisible();

  const renamedRow = page.locator(".crow", { hasText: "E2E Renamed Client" });
  await renamedRow.locator(".vdots").click();
  await page.click('.colpop button:has-text("Archive")');
  await expect(page.locator(".crow", { hasText: "E2E Renamed Client" })).toHaveCount(0);

  await page.click('button.chip:has-text("Archived")');
  const archivedRow = page.locator(".crow", { hasText: "E2E Renamed Client" });
  await expect(archivedRow).toBeVisible();

  await archivedRow.locator(".vdots").click();
  await page.click('.colpop button:has-text("Unarchive")');
  await page.click('button.chip:has-text("Active")');
  await expect(page.locator(".crow", { hasText: "E2E Renamed Client" })).toBeVisible();
});

test("New Client and Edit Client share the same modal, including industry and Client Team", async ({
  page,
  frank,
}) => {
  await frank.loginAsStaff(page);
  await page.goto("/dashboard");
  await page.waitForSelector(".crow:not(.head)");

  await page.click('button:has-text("New Client")');
  await page.fill("#cName", "Client Team Modal E2E");
  await page.fill("#cInd", "D2C beauty");
  await page.click('button:has-text("+ Add person")');
  await page.fill('.brow input[placeholder="Name"]', "Jonathan Lead");
  await page.fill('.brow input[placeholder="Email"]', "jonathan@example.com");
  await page.click('button:has-text("Create Client")');
  await expect(page.locator(".scrim")).toHaveCount(0);
  await expect(page.locator(".crow", { hasText: "Client Team Modal E2E" })).toBeVisible();

  const row = page.locator(".crow", { hasText: "Client Team Modal E2E" });
  await row.locator(".vdots").click();
  await page.click('.colpop button:has-text("Edit")');
  await expect(page.locator('input[value="Client Team Modal E2E"]')).toBeVisible();
  await expect(page.locator("#cInd")).toHaveValue("D2C beauty");
  await expect(page.locator('.brow input[placeholder="Name"]')).toHaveValue("Jonathan Lead");
  await expect(page.locator('.brow input[placeholder="Email"]')).toHaveValue("jonathan@example.com");

  await page.click('button:has-text("+ Add person")');
  await page.locator('.brow input[placeholder="Name"]').nth(1).fill("Priya Client");
  await page.locator('.brow input[placeholder="Email"]').nth(1).fill("priya@example.com");
  await page.click('button:has-text("Save")');
  await expect(page.locator(".scrim")).toHaveCount(0);

  await row.locator(".vdots").click();
  await page.click('.colpop button:has-text("Edit")');
  await expect(page.locator('.brow input[placeholder="Name"]')).toHaveCount(2);
  await expect(page.locator('.brow input[placeholder="Name"]').nth(1)).toHaveValue("Priya Client");
});

test("edit (name and type) and archive/unarchive a project from the client workspace", async ({
  page,
  frank,
}) => {
  await frank.loginAsStaff(page);
  await page.goto(`/clients/${frank.clientId}`);
  await page.waitForSelector(".crow:not(.head)");

  const row = page.locator(".crow", { hasText: "E2E Test Project" });
  await row.locator(".vdots").click();
  await page.click('.colpop button:has-text("Edit")');
  const modal = page.getByRole("dialog", { name: "Edit Project" });
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
  await modal.getByRole("button", { name: "Save" }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.locator(".crow", { hasText: "E2E Renamed Project" })).toContainText(
    "Paid Campaign",
  );

  await page.locator(".crow", { hasText: "E2E Renamed Project" }).locator(".vdots").click();
  await page.click('.colpop button:has-text("Edit")');
  await expect(modal.getByLabel("Type")).toHaveValue("Paid Campaign");
  await expect(modal.getByLabel("Type").locator("option")).toHaveCount(4);
  await modal.getByRole("button", { name: "Cancel" }).click();

  const renamedRow = page.locator(".crow", { hasText: "E2E Renamed Project" });
  await renamedRow.locator(".vdots").click();
  await page.click('.colpop button:has-text("Archive")');
  await expect(page.locator(".crow", { hasText: "E2E Renamed Project" })).toHaveCount(0);

  await page.click('button.chip:has-text("Archived")');
  const archivedRow = page.locator(".crow", { hasText: "E2E Renamed Project" });
  await expect(archivedRow).toBeVisible();

  await archivedRow.locator(".vdots").click();
  await page.click('.colpop button:has-text("Unarchive")');
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

test("popover closes on outside click and Escape, and never navigates the row", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto("/dashboard");
  await page.waitForSelector(".crow:not(.head)");
  const row = page.locator(".crow:not(.head)").first();

  await row.locator(".vdots").click();
  await expect(page.locator(".colpop")).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(page.locator(".colpop")).toHaveCount(0);

  await row.locator(".vdots").click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".colpop")).toHaveCount(0);

  // The row itself is a <Link> — opening/using the menu must never
  // navigate it away.
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("a real client-role session has no row actions menu anywhere", async ({ page, frank }) => {
  await frank.loginAsClient(page);
  await page.goto(`/clients/${frank.clientId}`);
  await page.waitForSelector(".crow:not(.head)");
  await expect(page.locator(".vdots")).toHaveCount(0);
});
