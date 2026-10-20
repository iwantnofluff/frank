import { createClient } from "@supabase/supabase-js";
import { test, expect, goToMonth, chooseFormat, showStatuses } from "./fixtures";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// The saved-view Save button is a .split; so, now, is New Post's — this is
// the one that saves the view.
function viewSaveSplit(page: import("@playwright/test").Page) {
  return page.locator(".split", { hasText: "Save as New View" });
}

// ContinuousCalendarTable — a copy of ProjectCalendarTable/project-calendar
// .spec.ts's own coverage, scoped to what's genuinely new or different here:
// the content-planner template with the New Post window's own names, the
// cx-jsonb-backed built-ins (Notes for Designer and Principles), the real copy versions, due_on-driven grouping in place of
// scheduled_at, and calendar_views now being scoped per table_type. Drag-
// resize/reorder/Columns-picker mechanics are verbatim-copied code already
// covered by project-calendar.spec.ts, so get one combined check here
// rather than the full matrix again.

// A row's cell under the column headed `label`, wherever that column is.
async function cellUnder(page: import("@playwright/test").Page, rowText: string, label: string) {
  // Once the page knows who's looking: the team's own columns (the
  // checkbox, VO, Notes for Designer) come in then, moving the rest along.
  if (!(await page.locator("th", { hasText: /^Notes for Designer/ }).count())) {
    await page.locator("tr[data-row] td input[type=checkbox]").first().waitFor({ timeout: 10_000 }).catch(() => {});
  }
  const index = await page.locator("thead tr").first().evaluate((tr, l) => {
    const name = (th: Element) => {
      const copy = th.cloneNode(true) as HTMLElement;
      copy.querySelectorAll("small").forEach((x) => x.remove());
      return (copy.textContent ?? "").trim();
    };
    return [...tr.querySelectorAll(":scope > th")].findIndex((th) => name(th) === l);
  }, label);
  expect(index, `a column headed ${label}`).toBeGreaterThan(-1);
  return page.locator("tr[data-row]", { hasText: rowText }).locator("td").nth(index);
}

test("continuous calendar — the template's columns, named as in the New Post window", async ({ page, frank }) => {
  const projectId = await frank.createContinuousProject();
  await frank.createContinuousCreative(projectId, { dueOn: "2027-03-15" });
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  await page.waitForSelector(".tbl");

  // In the Social Media table's order, Notes for Designer before Creative
  // (direct instruction); Destination, Funnel, TG and Final Creative gone.
  await expect(page.locator(".calbar button", { hasText: "Columns" })).toHaveText("Columns 15/15");
  // Each heading's name, without its <small> subtitle.
  const headings = await page.locator("thead tr").first().locator("th").evaluateAll((ths) =>
    ths
      .map((th) => {
        const copy = th.cloneNode(true) as HTMLElement;
        copy.querySelectorAll("small").forEach((x) => x.remove());
        return (copy.textContent ?? "").trim();
      })
      .filter(Boolean),
  );
  expect(headings).toEqual([
    "Live Date", "Status", "Format", "Slides", "Team", "Post Name", "Concept & Reference", "VO", "Notes for Designer",
    "Creative", "Text on Image", "Caption/Copy", "Alt Text", "WIIFM Direction", "Principles",
  ]);
});

test("continuous calendar — Notes for Designer persist", async ({ page, frank }) => {
  const projectId = await frank.createContinuousProject();
  await frank.createContinuousCreative(projectId, { name: "Chip Test Creative", dueOn: "2027-03-15" });
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  await page.waitForSelector(".tbl");

  // Never edited in the cell (direct instruction): its Add opens the
  // post's window at the notes, and the table shows them once saved,
  // without a reload.
  const row = page.locator("tr[data-row]", { hasText: "Chip Test Creative" });
  await expect(row.locator("textarea, input:not([type=checkbox]), select")).toHaveCount(0);
  await row.getByRole("button", { name: "Add Notes" }).click();
  await expect(page.locator("#nbNotes")).toBeFocused({ timeout: 15_000 });
  await page.locator("#nbNotes").fill("Keep the logo top left");
  await page.getByRole("button", { name: "Update" }).click();
  await expect(page.getByText("Post updated.")).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await expect(row).toContainText("Keep the logo top left", { timeout: 10_000 });
  await expect(row.getByRole("button", { name: "Add Notes" })).toHaveCount(0);
  await page.reload();
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  await page.waitForSelector(".tbl");
  await expect(page.locator("tr[data-row]", { hasText: "Chip Test Creative" })).toContainText("Keep the logo top left");
});

test("continuous calendar — Format, Text on Image and Copy come from the post itself", async ({ page, frank }) => {
  const projectId = await frank.createContinuousProject();
  const id = await frank.createContinuousCreative(projectId, { name: "Copy Test Creative", dueOn: "2027-03-15" });
  await frank.createCopyVersion(id, 1, { caption: "First caption" });
  await frank.createCopyVersion(id, 2, { caption: "Second caption" });
  // Text on Image is on the post itself (phase57), not in the versions.
  await admin.from("creatives").update({ slide_text: ["On the artwork"] }).eq("id", id);
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  await page.waitForSelector(".tbl");

  // Format, Text on Image (no versions), Copy: the latest version, older
  // on hover.
  const format = await cellUnder(page, "Copy Test Creative", "Format");
  const textOnImage = await cellUnder(page, "Copy Test Creative", "Text on Image");
  const copy = await cellUnder(page, "Copy Test Creative", "Caption/Copy");
  await expect(format).toHaveText("Instagram Post");
  // The text, then its Edit (direct instruction).
  await expect(textOnImage.locator(".cc-t")).toHaveText("On the artwork");
  await expect(textOnImage.locator(".tedit-btn")).toHaveText("Edit");
  await expect(copy).toContainText("Second caption");
  await expect(copy).toContainText("+1 earlier");
  await copy.locator(".cc-n").hover();
  await expect(page.locator(".copypop")).toContainText("First caption");
  // Nothing to type into: the copy is written in the post's own window.
  await expect(copy.locator("textarea")).toHaveCount(0);
});

test("continuous calendar — status filter narrows the visible rows", async ({ page, frank }) => {
  const projectId = await frank.createContinuousProject();
  await frank.createContinuousCreative(projectId, { name: "Client Review Creative", dueOn: "2027-03-15", stage: 4 });
  await frank.createContinuousCreative(projectId, { name: "Concept Stage Creative", dueOn: "2027-03-15", stage: 1 });
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  await page.waitForSelector(".tbl");
  await expect(page.locator(".pname", { hasText: "Concept Stage Creative" })).toBeVisible();

  await showStatuses(page, ["4. Client Review"]);
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

  await page.getByRole("button", { name: "New Post", exact: true }).click();
  await page.fill("#nbName", "Continuous Calendar Jump E2E");
  await page.fill("#nbDue", "2027-06-10");
  await chooseFormat(page, "A+ Content Module");
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
  // Further right since Format, Slides and Lead joined: in view first.
  await statusTh.scrollIntoViewIfNeeded();
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
  await page.getByRole("checkbox", { name: /^Show Principles/ }).click();
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

  await expect(page.getByRole("button", { name: "New Post", exact: true })).toHaveCount(0);
  const row = page.locator("tr[data-row]", { hasText: "Client View Creative" });
  // Nothing to edit and no Add or Edit buttons (Notes for Designer and
  // Principles are the team's to fill, in the post's window).
  await expect(row.locator("textarea, input:not([type=checkbox]), select")).toHaveCount(0);
  await expect(row.locator(".tpending-btn, .tedit-btn")).toHaveCount(0);
  // Notes for Designer is the team's (phase112): no column for a client.
  await expect(page.locator("th", { hasText: /^Notes for Designer/ })).toHaveCount(0);
  // VO is the team's (phase88): no column for a client.
  await expect(page.locator("th", { hasText: /^VO/ })).toHaveCount(0);
});
