import { test, expect, goToMonth } from "./fixtures";

// The saved-view Save button is a .split; so, now, is New Post's — this is
// the one that saves the view.
function viewSaveSplit(page: import("@playwright/test").Page) {
  return page.locator(".split", { hasText: "Save as New View" });
}

// ContinuousCalendarTable — a copy of ProjectCalendarTable/project-calendar
// .spec.ts's own coverage, scoped to what's genuinely new or different here:
// the 13-field template, the cx-jsonb-backed built-ins (Funnel/Type/TG/
// Final Creative/V1-V2 Copy/Principles), due_on-driven grouping in place of
// scheduled_at, and calendar_views now being scoped per table_type. Drag-
// resize/reorder/Columns-picker mechanics are verbatim-copied code already
// covered by project-calendar.spec.ts, so get one combined check here
// rather than the full matrix again.

test("continuous calendar — matches the 13-field content-planner template", async ({ page, frank }) => {
  const projectId = await frank.createContinuousProject();
  await frank.createContinuousCreative(projectId, { dueOn: "2027-03-15" });
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  await page.waitForSelector(".tbl");

  // 12 toggleable + the frozen Live Date column = 13.
  await expect(page.locator(".calbar button", { hasText: "Columns" })).toHaveText("Columns 13/13");
  for (const label of [
    "Live Date", "Creative Name", "Placement", "Funnel", "TG", "Type", "Status",
    "Concept and Ref", "Final Creative", "V1 Copy", "V2 Copy", "Notes for Designer", "Principles",
  ]) {
    await expect(page.locator("th", { hasText: new RegExp(`^${label}`) })).toHaveCount(1);
  }
});

test("continuous calendar — Funnel and Type chips persist", async ({ page, frank }) => {
  const projectId = await frank.createContinuousProject();
  await frank.createContinuousCreative(projectId, { name: "Chip Test Creative", dueOn: "2027-03-15" });
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  await page.waitForSelector(".tbl");

  // Default column order's td indices: 0 the staff-only select-row
  // checkbox, 1 Live Date, 2 Creative Name, 3 Placement, 4 Funnel, 5 TG,
  // 6 Type.
  const row = page.locator("tr[data-row]", { hasText: "Chip Test Creative" });
  const cells = row.locator("td");
  await cells.nth(4).locator("select").selectOption("tof");
  await cells.nth(6).locator("select").selectOption("video");
  await page.reload();
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  await page.waitForSelector(".tbl");
  const reloadedRow = page.locator("tr[data-row]", { hasText: "Chip Test Creative" });
  const reloadedCells = reloadedRow.locator("td");
  await expect(reloadedCells.nth(4).locator("select")).toHaveValue("tof");
  await expect(reloadedCells.nth(4)).toContainText("TOF");
  await expect(reloadedCells.nth(6).locator("select")).toHaveValue("video");
  await expect(reloadedCells.nth(6)).toContainText("Video");
});

test("continuous calendar — V1/V2 Copy persist independently", async ({ page, frank }) => {
  const projectId = await frank.createContinuousProject();
  await frank.createContinuousCreative(projectId, { name: "Copy Test Creative", dueOn: "2027-03-15" });
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  await page.waitForSelector(".tbl");

  const row = page.locator("tr[data-row]", { hasText: "Copy Test Creative" });
  const textareas = row.locator("textarea.cxin");
  await textareas.nth(0).fill("First draft of the copy");
  await textareas.nth(0).blur();
  await textareas.nth(1).fill("Revised, alternative angle");
  await textareas.nth(1).blur();
  await page.waitForTimeout(200);

  await page.reload();
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  await page.waitForSelector(".tbl");
  const reloadedRow = page.locator("tr[data-row]", { hasText: "Copy Test Creative" });
  const reloadedTextareas = reloadedRow.locator("textarea.cxin");
  await expect(reloadedTextareas.nth(0)).toHaveValue("First draft of the copy");
  await expect(reloadedTextareas.nth(1)).toHaveValue("Revised, alternative angle");
});

test("continuous calendar — status filter narrows the visible rows", async ({ page, frank }) => {
  const projectId = await frank.createContinuousProject();
  await frank.createContinuousCreative(projectId, { name: "Client Review Creative", dueOn: "2027-03-15", stage: 3 });
  await frank.createContinuousCreative(projectId, { name: "Concept Stage Creative", dueOn: "2027-03-15", stage: 1 });
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  await page.waitForSelector(".tbl");
  await expect(page.locator(".pname", { hasText: "Concept Stage Creative" })).toBeVisible();

  await page.selectOption("select.sort", "review");
  await expect(page.locator(".pname", { hasText: "Concept Stage Creative" })).toHaveCount(0);
  await expect(page.locator(".pname", { hasText: "Client Review Creative" })).toBeVisible();
});

test("continuous calendar — Calendar mode renders the day grid from due_on", async ({ page, frank }) => {
  const projectId = await frank.createContinuousProject();
  await frank.createContinuousCreative(projectId, { name: "Grid Test Creative", dueOn: "2027-03-15" });
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  await page.waitForSelector(".tbl");

  await page.click('button[aria-pressed]:has-text("Calendar")');
  await page.waitForSelector(".calgrid");
  await expect(page.locator(".ev", { hasText: "Grid Test Creative" })).toBeVisible();
});

test("continuous calendar — jumps to the month of a newly created brief", async ({ page, frank }) => {
  const projectId = await frank.createContinuousProject();
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${projectId}`);
  await page.waitForSelector(".tblwrap, .empty");

  await page.click('button:has-text("New Post")');
  await page.fill("#nbName", "Continuous Calendar Jump E2E");
  await page.fill("#nbDest", "https://example.com/listing");
  await page.fill("#nbDue", "2027-06-10");
  await page.click('button:has-text("Create Post")');

  await expect(page.locator(".calmonth")).toHaveText("June 2027");
  await expect(page.locator(".pname", { hasText: "Continuous Calendar Jump E2E" })).toBeVisible();
});

test("continuous calendar — resizing a column marks the view dirty, Discard Changes reverts it", async ({
  page,
  frank,
}) => {
  const projectId = await frank.createContinuousProject();
  await frank.createContinuousCreative(projectId, { dueOn: "2027-03-15" });
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  await page.waitForSelector(".tbl");

  await expect(viewSaveSplit(page)).toHaveCount(0);
  const statusTh = page.locator("th", { hasText: "Status" });
  const originalWidth = (await statusTh.boundingBox())!.width;
  const gripBox = (await statusTh.locator(".grip").boundingBox())!;
  await page.mouse.move(gripBox.x + 3, gripBox.y + 5);
  await page.mouse.down();
  await page.mouse.move(gripBox.x + 80, gripBox.y + 5, { steps: 5 });
  await page.mouse.up();

  await expect(viewSaveSplit(page).locator(".btn.primary").first()).toHaveText("Save as New View");
  const resizedWidth = (await statusTh.boundingBox())!.width;
  expect(resizedWidth).toBeGreaterThan(originalWidth + 50);

  await viewSaveSplit(page).locator(".split-t").click();
  await page.click('.colpop .cpr:has-text("Discard Changes")');
  await expect(viewSaveSplit(page)).toHaveCount(0);
});

test("continuous calendar — saved views are scoped separately from Scheduled's own", async ({ page, frank }) => {
  const projectId = await frank.createContinuousProject();
  await frank.createContinuousCreative(projectId, { dueOn: "2027-03-15" });
  await frank.loginAsStaff(page);

  // Save a view from the continuous table.
  await page.goto(`/projects/${projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  await page.waitForSelector(".tbl");
  await page.click('button:has-text("Columns")');
  await page.waitForSelector(".colpop");
  await page.click('.cpr:has-text("Principles")');
  await page.keyboard.press("Escape");
  await page.click('.split button:has-text("Save as New View")');
  await page.fill("#viewName", "Continuous-Only View");
  // Scoped to the modal — the toolbar's own "Save as New View" trigger
  // button (still visible behind it) also matches a plain :has-text("Save").
  await page.click('.scrim button:has-text("Save")');
  await expect(page.locator(".vtab", { hasText: "Continuous-Only View" })).toBeVisible();

  // The Scheduled table's own tabs must not show it.
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await expect(page.locator(".vtab", { hasText: "Continuous-Only View" })).toHaveCount(0);
});

test("a real client-role session sees the continuous table read-only", async ({ page, frank }) => {
  const projectId = await frank.createContinuousProject();
  await frank.createContinuousCreative(projectId, { name: "Client View Creative", dueOn: "2027-03-15" });
  await frank.loginAsClient(page);
  await page.goto(`/projects/${projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  await page.waitForSelector(".tbl");

  await expect(page.locator('button:has-text("New Post")')).toHaveCount(0);
  const row = page.locator("tr[data-row]", { hasText: "Client View Creative" });
  await expect(row.locator("select").first()).toBeDisabled();
  await expect(row.locator("textarea.cxin").first()).toBeDisabled();
});
