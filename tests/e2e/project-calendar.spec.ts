import { test, expect } from "./fixtures";

test("project calendar", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  // Scheduled-delivery projects (the fixture's default project) render
  // ProjectCalendarTable, not the flat .ptable — that's continuous-only
  // now. Its own empty state ("Nothing scheduled") covers the case where
  // the current month has nothing in it, same as .empty elsewhere.
  await page.waitForSelector(".tblwrap, .empty");
  // useIsStaff (useMyAgency + useMyMembership) resolves on its own,
  // independent of useProject/useCreatives — the New Brief button and the
  // Settings nav item both fail closed (hidden) until it does. Without
  // this wait the screenshot races ahead and can land on that hidden
  // state under worker concurrency, same shape as the dashboard's stat
  // cards needing their own explicit wait.
  await page.waitForSelector('button:has-text("New Brief")');
  await expect(page).toHaveScreenshot("project-calendar.png");
});

test("project calendar — jumps to the month of a newly created brief", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");

  await page.click('button:has-text("New Brief")');
  await page.fill("#nbName", "Calendar Jump E2E");
  await page.fill("#nbDate", "2027-06-10");
  await page.click('button:has-text("Create Brief")');

  await expect(page.locator(".calmonth")).toHaveText("June 2027");
  await expect(page.locator(".pname", { hasText: "Calendar Jump E2E" })).toBeVisible();
});

test("project calendar — status filter narrows the visible rows", async ({ page, frank }) => {
  // Fixture's default creative is stage 3 (Client Review), scheduled_at
  // 2027-03-15 — an extra stage-1 creative on the same date lets the
  // "Client Review" filter be checked against a real exclusion, not just
  // an empty vs. non-empty state.
  await frank.createCreativeAtStage(1, "Concept-Stage E2E");
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");

  for (let i = 0; i < 6; i++) {
    await page.click('.calnav button[title="Next"]');
  }
  await expect(page.locator(".pname", { hasText: "Concept-Stage E2E" })).toBeVisible();

  await page.selectOption("select.sort", "review");
  await expect(page.locator(".pname", { hasText: "Concept-Stage E2E" })).toHaveCount(0);
  await expect(page.locator(".pname", { hasText: "E2E Test Creative" })).toBeVisible();
});

test("project calendar — Calendar mode renders the day grid and hides the Columns button", async ({
  page,
  frank,
}) => {
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  for (let i = 0; i < 6; i++) {
    await page.click('.calnav button[title="Next"]');
  }

  await page.click('button[aria-pressed]:has-text("Calendar")');
  await page.waitForSelector(".calgrid");
  await expect(page.locator(".ev", { hasText: "E2E Test Creative" })).toBeVisible();
  await expect(page.locator('button:has-text("Columns")')).toHaveCount(0);

  await page.click('button[aria-pressed]:has-text("Month")');
  await expect(page.locator(".tbl")).toBeVisible();
  await expect(page.locator('button:has-text("Columns")')).toBeVisible();
});

test("project calendar — Columns picker hides and reshows a column", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  for (let i = 0; i < 6; i++) {
    await page.click('.calnav button[title="Next"]');
  }
  await page.waitForSelector(".tbl");

  await expect(page.locator("th", { hasText: "Concept" })).toBeVisible();
  await page.click('button:has-text("Columns")');
  await page.waitForSelector(".colpop");
  await page.click('.cpr:has-text("Concept")');
  await expect(page.locator("th", { hasText: "Concept" })).toHaveCount(0);
  await expect(page.locator(".calbar button", { hasText: "Columns" })).toHaveText("Columns 13/14");

  await page.click('button:has-text("Columns")');
  await page.click('.cpr:has-text("Concept")');
  await expect(page.locator("th", { hasText: "Concept" })).toBeVisible();
});

test("project calendar — Week/Date/Day stay frozen while the table scrolls horizontally", async ({
  page,
  frank,
}) => {
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  for (let i = 0; i < 6; i++) {
    await page.click('.calnav button[title="Next"]');
  }
  await page.waitForSelector(".tbl");

  await page.locator(".tblwrap").evaluate((el) => (el.scrollLeft = 300));
  // The frozen Week header stays visible with real text, not an empty
  // sticky cell — this is the exact `c.left` truthiness bug (left:0 read
  // as falsy) a real horizontal-scroll screenshot caught during this
  // build; a plain visibility check at scrollLeft 0 would have missed it.
  await expect(page.locator("th.sk1")).toHaveText("WeekNo.");
  await expect(page.locator("td.sk1 b")).toHaveText("12");
});

test("project calendar — hovering a creative shows the real preview popover", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  for (let i = 0; i < 6; i++) {
    await page.click('.calnav button[title="Next"]');
  }
  await page.waitForSelector(".tbl");

  await page.hover(".pname");
  await page.waitForSelector(".evpop.on");
  await expect(page.locator(".evpop .rvt")).toHaveText("E2E Test Creative");
  await expect(page.locator(".evpop .pp-pending")).toHaveText("Not published yet");
});

test("project calendar — hover preview holds open while the pointer moves onto it", async ({
  page,
  frank,
}) => {
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  for (let i = 0; i < 6; i++) {
    await page.click('.calnav button[title="Next"]');
  }
  await page.waitForSelector(".tbl");

  const pname = page.locator(".pname").first();
  const box = (await pname.boundingBox())!;
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.waitForSelector(".evpop.on");

  // Move onto the popover itself, the way a real pointer travels from the
  // trigger to the card — an instant hide-on-leave used to race this and
  // close the card before it could ever be reached.
  const popBox = (await page.locator(".evpop").boundingBox())!;
  await page.mouse.move(popBox.x + 20, popBox.y + 20, { steps: 10 });
  await page.waitForTimeout(300);
  await expect(page.locator(".evpop.on")).toBeVisible();
});

test("project calendar — matches the real content-planner template's 14 default columns", async ({
  page,
  frank,
}) => {
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  for (let i = 0; i < 6; i++) {
    await page.click('.calnav button[title="Next"]');
  }
  await page.waitForSelector(".tbl");

  await expect(page.locator(".calbar button", { hasText: "Columns" })).toHaveText("Columns 14/14");
  for (const label of [
    "Week", "Date", "Day", "Time", "Status", "Post Type", "Lead", "Platform",
    "Asset Name/Link", "Concept", "Image on Text", "Post Copy", "Approach Notes", "Client Feedback",
  ]) {
    // Anchored at the start: a th's text is always {label}{sub} with no
    // separator, and hasText's substring match is case-insensitive, so an
    // unanchored search for e.g. "Week" also matches Day's own sub-label
    // ("Of week").
    await expect(page.locator("th", { hasText: new RegExp(`^${label}`) })).toHaveCount(1);
  }
});

test("project calendar — Post Copy cell shows the latest version, older ones on hover", async ({
  page,
  frank,
}) => {
  await frank.createCopyVersion(frank.creativeId, 1, { caption: "First draft caption" });
  await frank.createCopyVersion(frank.creativeId, 2, { caption: "Second, revised caption" });
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  for (let i = 0; i < 6; i++) {
    await page.click('.calnav button[title="Next"]');
  }
  await page.waitForSelector(".tbl");

  const cell = page.locator("td:has(.copyc)").first();
  await expect(cell.locator(".cc-t")).toHaveText("Second, revised caption");
  await expect(cell.locator(".cc-n")).toHaveText("+1 earlier");

  await cell.locator(".copyc").hover();
  await page.waitForSelector(".copypop.on");
  const rows = page.locator(".copypop .cp-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("V2");
  await expect(rows.nth(0)).toContainText("Latest");
  await expect(rows.nth(0)).toContainText("Second, revised caption");
  await expect(rows.nth(1)).toContainText("V1");
  await expect(rows.nth(1)).toContainText("First draft caption");
});

test("project calendar — resizing a column shows the Save button, Discard Changes reverts it", async ({
  page,
  frank,
}) => {
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  for (let i = 0; i < 6; i++) {
    await page.click('.calnav button[title="Next"]');
  }
  await page.waitForSelector(".tbl");

  await expect(page.locator(".split")).toHaveCount(0);
  const statusTh = page.locator("th", { hasText: "Status" });
  const originalWidth = (await statusTh.boundingBox())!.width;
  const gripBox = (await statusTh.locator(".grip").boundingBox())!;
  await page.mouse.move(gripBox.x + 3, gripBox.y + 5);
  await page.mouse.down();
  await page.mouse.move(gripBox.x + 80, gripBox.y + 5, { steps: 5 });
  await page.mouse.up();

  await expect(page.locator(".split .btn.primary").first()).toHaveText("Save as New View");
  const resizedWidth = (await statusTh.boundingBox())!.width;
  expect(resizedWidth).toBeGreaterThan(originalWidth + 50);

  await page.click(".split .split-t");
  await page.click('.colpop .cpr:has-text("Discard Changes")');
  await expect(page.locator(".split")).toHaveCount(0);
  const revertedWidth = (await statusTh.boundingBox())!.width;
  expect(Math.abs(revertedWidth - originalWidth)).toBeLessThan(2);
});

test("project calendar — dragging a column header reorders the table", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  for (let i = 0; i < 6; i++) {
    await page.click('.calnav button[title="Next"]');
  }
  await page.waitForSelector(".tbl");

  async function headerOrder() {
    return page.locator("thead th").allTextContents();
  }
  const before = await headerOrder();
  const conceptIndex = before.findIndex((t) => t.startsWith("Concept"));
  const statusIndex = before.findIndex((t) => t.startsWith("Status"));
  expect(conceptIndex).toBeGreaterThan(statusIndex);

  const conceptTh = page.locator("th", { hasText: "Concept" });
  const statusTh = page.locator("th", { hasText: "Status" });
  const conceptBox = (await conceptTh.boundingBox())!;
  const statusBox = (await statusTh.boundingBox())!;
  await page.mouse.move(conceptBox.x + 20, conceptBox.y + 10);
  await page.mouse.down();
  await page.mouse.move(statusBox.x + 20, statusBox.y + 10, { steps: 10 });
  await page.mouse.up();

  const after = await headerOrder();
  const newConceptIndex = after.findIndex((t) => t.startsWith("Concept"));
  const newStatusIndex = after.findIndex((t) => t.startsWith("Status"));
  expect(newConceptIndex).toBeLessThan(newStatusIndex);
  await expect(page.locator(".split .btn.primary").first()).toHaveText("Save as New View");
});

test("project calendar — hiding a column via the Columns picker also marks the view dirty", async ({
  page,
  frank,
}) => {
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  for (let i = 0; i < 6; i++) {
    await page.click('.calnav button[title="Next"]');
  }
  await page.waitForSelector(".tbl");

  await page.click('button:has-text("Columns")');
  await page.waitForSelector(".colpop");
  await page.click('.cpr:has-text("Concept")');
  await page.keyboard.press("Escape");

  await expect(page.locator(".split .btn.primary").first()).toHaveText("Save as New View");
});
