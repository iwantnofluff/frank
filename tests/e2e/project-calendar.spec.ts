import { test, expect, goToMonth, chooseFormat, showStatuses } from "./fixtures";

// The saved-view Save button is a .split; so, now, is New Post's — this is
// the one that saves the view.
function viewSaveSplit(page: import("@playwright/test").Page) {
  return page.locator(".split", { hasText: "Save as New View" });
}

test("project calendar", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  // ProjectCalendarTable's own empty state ("Nothing scheduled") covers
  // the case where the current month has nothing in it, same as .empty
  // elsewhere.
  await page.waitForSelector(".tblwrap, .empty");
  // useIsStaff (useMyAgency + useMyMembership) resolves on its own,
  // independent of useProject/useCreatives — the New Brief button and the
  // Settings nav item both fail closed (hidden) until it does. Without
  // this wait the screenshot races ahead and can land on that hidden
  // state under worker concurrency, same shape as the dashboard's stat
  // cards needing their own explicit wait.
  await page.getByRole("button", { name: "New Post", exact: true }).waitFor();
  // The view opens on the current month, so its name (and the empty
  // state's sentence naming it) changes every month — masked so the
  // baseline doesn't go stale on the 1st.
  await expect(page).toHaveScreenshot("project-calendar.png", {
    mask: [page.locator(".calmonth"), page.locator(".empty span")],
  });
});

test("project calendar — jumps to the month of a newly created brief", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");

  await page.getByRole("button", { name: "New Post", exact: true }).click();
  await page.fill("#nbName", "Calendar Jump E2E");
  await page.fill("#nbDate", "2027-06-10");
  await chooseFormat(page);
  await page.click('button:has-text("Create Post")');

  await expect(page.locator(".calmonth")).toHaveText("June 2027");
  await expect(page.locator(".pname", { hasText: "Calendar Jump E2E" })).toBeVisible();
});

test("project calendar — status filter narrows the visible rows", async ({ page, frank }) => {
  // Fixture's default creative is stage 4 (Client Review), scheduled_at
  // 2027-03-15 — an extra stage-1 creative on the same date lets the
  // "Client Review" filter be checked against a real exclusion, not just
  // an empty vs. non-empty state.
  await frank.createCreativeAtStage(1, "Concept-Stage E2E");
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");

  await goToMonth(page, "March 2027");
  await expect(page.locator(".pname", { hasText: "Concept-Stage E2E" })).toBeVisible();

  // Idea, then the six stages (In Production, phase102), any combination.
  await page.getByRole("button", { name: "Status", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Statuses" }).getByRole("checkbox")).toHaveText([
    "All Statuses", "0. Idea", "1. Concept", "2. In Production", "3. Internal Review", "4. Client Review", "5. Approved", "6. Live",
  ]);
  await page.keyboard.press("Escape");
  await showStatuses(page, ["4. Client Review"]);
  await expect(page.getByRole("button", { name: "Status", exact: true })).toHaveText("4. Client Review");
  await expect(page.locator(".pname", { hasText: "Concept-Stage E2E" })).toHaveCount(0);
  await expect(page.locator(".pname", { hasText: "E2E Test Creative" })).toBeVisible();
  await showStatuses(page, ["1. Concept", "4. Client Review"]);
  await expect(page.getByRole("button", { name: "Status", exact: true })).toHaveText("2 Statuses");
  await expect(page.locator(".pname", { hasText: "Concept-Stage E2E" })).toBeVisible();
});

test("project calendar — a post with no date is an Idea, the team's only, under the weeks", async ({ page, frank }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: me } = await admin.from("creatives").select("created_by").eq("id", frank.creativeId).single();
  const { error } = await admin
    .from("creatives")
    .insert({ project_id: frank.projectId, name: "Loyalty Card Idea", format: "ig_feed", formats: ["ig_feed"], stage: 1, created_by: me!.created_by });
  if (error) throw error;
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  // In any month, under the weeks (direct instruction).
  await goToMonth(page, "March 2027");
  const band = page.locator("tr.ideaband");
  await expect(band).toHaveText(/No Scheduled Date\s*1 Idea/);
  const row = page.locator("tr[data-row]", { hasText: "Loyalty Card Idea" });
  await expect(row.locator(".stg.idea")).toHaveText(/^0\.\s*Idea$/);
  // Not shown when Idea isn't among the statuses.
  await showStatuses(page, ["4. Client Review"]);
  await expect(band).toHaveCount(0);
  await showStatuses(page, ["0. Idea"]);
  await expect(band).toBeVisible();
  await expect(page.locator(".pname", { hasText: "E2E Test Creative" })).toHaveCount(0);
  // Not on the Review page: a click opens its Edit window here.
  await row.locator("td.sk3").click();
  await expect(page.locator("#nbName")).toBeFocused();
  expect(page.url()).toContain(`/projects/${frank.projectId}`);
  await page.getByRole("button", { name: "Cancel" }).last().click();
  // A date makes it a post like any other, at its own stage.
  await row.getByRole("button", { name: "Add Date" }).click();
  const pop = page.getByRole("dialog", { name: /Publish Date/ });
  await pop.getByLabel("Publish Date").fill("2027-03-17");
  await page.keyboard.press("Escape");
  await pop.getByRole("button", { name: "Save" }).click();
  await expect(pop).toHaveCount(0);
  await showStatuses(page, ["0. Idea", "1. Concept", "2. In Production", "3. Internal Review", "4. Client Review", "5. Approved", "6. Live"]);
  await expect(band).toHaveCount(0);
  const dated = page.locator("tr[data-row]", { hasText: "Loyalty Card Idea" });
  await expect(dated.locator("td.sk2")).toHaveText("17 Mar 27");
  // Clearing the date and saving takes it off again (reported directly:
  // Save stayed greyed): back under No Scheduled Date.
  await dated.getByRole("button", { name: "17 Mar 27" }).click();
  const again = page.getByRole("dialog", { name: /Publish Date/ });
  await again.getByLabel("Publish Date").fill("");
  await page.keyboard.press("Escape");
  await expect(again.getByRole("button", { name: "Save" })).toBeEnabled();
  await again.getByRole("button", { name: "Save" }).click();
  await expect(again).toHaveCount(0);
  await expect(band).toHaveText(/No Scheduled Date\s*1 Idea/);
  await expect(page.locator("tr[data-row]", { hasText: "Loyalty Card Idea" }).locator(".stg.idea")).toHaveText(/^0\.\s*Idea$/);
});

test("project calendar — a client never sees an Idea", async ({ page, frank }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: me } = await admin.from("creatives").select("created_by").eq("id", frank.creativeId).single();
  const { data: idea, error } = await admin
    .from("creatives")
    .insert({ project_id: frank.projectId, name: "Secret Idea", format: "ig_feed", formats: ["ig_feed"], stage: 4, created_by: me!.created_by })
    .select("id")
    .single();
  if (error) throw error;
  await frank.loginAsClient(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  await expect(page.locator(".pname", { hasText: "E2E Test Creative" })).toBeVisible();
  await expect(page.getByText("Secret Idea")).toHaveCount(0);
  await expect(page.locator("tr.ideaband")).toHaveCount(0);
  // Nor by its address.
  await page.goto(`/creatives/${idea!.id}`);
  await expect(page.getByText("Couldn’t load this creative")).toBeVisible();
});

test("project calendar — platform filter shows posts going out on that platform", async ({ page, frank }) => {
  // Fixture's post is Instagram Post (Meta); one LinkedIn-only post beside it.
  const li = await frank.createCreativeAtStage(4, "LinkedIn Only E2E");
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { error } = await admin.from("creatives").update({ format: "li_image", formats: ["li_image"] }).eq("id", li);
  if (error) throw error;
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  const platform = page.getByLabel("Platform");
  await expect(platform.locator("option")).toHaveText(["All Platforms", "Meta", "LinkedIn", "Pinterest", "YouTube"]);
  await platform.selectOption("linkedin");
  await expect(page.locator(".pname", { hasText: "LinkedIn Only E2E" })).toBeVisible();
  await expect(page.locator(".pname", { hasText: "E2E Test Creative" })).toHaveCount(0);
  await platform.selectOption("meta");
  await expect(page.locator(".pname", { hasText: "E2E Test Creative" })).toBeVisible();
  await expect(page.locator(".pname", { hasText: "LinkedIn Only E2E" })).toHaveCount(0);
});

test("project calendar — Calendar mode renders the day grid and hides the Columns button", async ({
  page,
  frank,
}) => {
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");

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
  await goToMonth(page, "March 2027");
  await page.waitForSelector(".tbl");

  await expect(page.locator("th", { hasText: "Concept" })).toBeVisible();
  await page.click('button:has-text("Columns")');
  await page.waitForSelector(".colpop");
  await page.getByRole("checkbox", { name: /^Show Concept/ }).click();
  await expect(page.locator("th", { hasText: "Concept" })).toHaveCount(0);
  await expect(page.locator(".calbar button", { hasText: "Columns" })).toHaveText("Columns 18/19");

  await page.click('button:has-text("Columns")');
  await page.getByRole("checkbox", { name: /^Show Concept/ }).click();
  await expect(page.locator("th", { hasText: "Concept" })).toBeVisible();
});

test("project calendar — Week/Date/Day stay frozen while the table scrolls horizontally", async ({
  page,
  frank,
}) => {
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  await page.waitForSelector(".tbl");

  await page.locator(".tblwrap").evaluate((el) => (el.scrollLeft = 300));
  // The frozen Week header stays visible with real text, not an empty
  // sticky cell — this is the exact `c.left` truthiness bug (left:0 read
  // as falsy) a real horizontal-scroll screenshot caught during this
  // build; a plain visibility check at scrollLeft 0 would have missed it.
  await expect(page.locator("th.sk1")).toHaveText("WeekNo.");
  await expect(page.locator("td.sk1")).toHaveText("12");
});

test("project calendar — hovering a creative shows the real preview popover", async ({ page, frank }) => {
  await frank.createArtworkVersion(frank.creativeId, 1, "march-hero.png");
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  await page.waitForSelector(".tbl");

  // The Creative column shows the file's name, and hovering it shows the
  // preview; Post Name no longer does (direct instruction).
  await page.waitForSelector("td.skchk");
  await page.hover(".pname");
  await page.waitForTimeout(500);
  await expect(page.locator(".evpop.on")).toHaveCount(0);
  await expect(page.locator(".artname")).toHaveText("march-hero.png");
  await page.hover(".artname");
  await page.waitForSelector(".evpop.on");
  // The stage strip is just the table's Status pill; the name is below it.
  await expect(page.locator(".evpop .rvt")).toHaveCount(0);
  await expect(page.locator(".evpop .rv .stg")).toHaveText(/^\d\.\S/);
  await expect(page.locator(".evpop .pp-h b")).toHaveText("E2E Test Creative");
  await expect(page.locator(".evpop .pp-pending")).toHaveText("Not published yet");
});

test("project calendar — hover preview holds open while the pointer moves onto it", async ({
  page,
  frank,
}) => {
  await frank.createArtworkVersion(frank.creativeId, 1, "march-hero.png");
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  await page.waitForSelector(".tbl");

  // Hover once the layout has settled: the staff-only select column
  // arrives a moment after the table and shifts every column, which can
  // slide the name out from under a pointer already on it.
  await page.waitForSelector("td.skchk");
  const art = page.locator(".artname").first();
  // Off to the right of a narrow viewport until scrolled to.
  await art.scrollIntoViewIfNeeded();
  const box = (await art.boundingBox())!;
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

test("project calendar — matches the real content-planner template's default columns, less Platform", async ({
  page,
  frank,
}) => {
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  await page.waitForSelector(".tbl");

  await expect(page.locator(".calbar button", { hasText: "Columns" })).toHaveText("Columns 19/19");
  for (const label of [
    "Week", "Publish Date", "Day", "Time", "Status", "Format", "Slides", "Team",
    "Post Name", "Concept & Reference", "VO", "Notes for Designer", "Creative", "Text on Image", "Caption/Copy", "Alt Text", "WIIFM Direction", "Internal Feedback", "Client Feedback",
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
  await goToMonth(page, "March 2027");
  await page.waitForSelector(".tbl");

  // The Copy cell: the one with a version label.
  const cell = page.locator("td:has(.cc-v)").first();
  await expect(cell.locator(".cc-t")).toHaveText("Second, revised caption");
  await expect(cell.locator(".cc-n")).toHaveText("+1 earlier");

  // Earlier versions open from the "+1 earlier" label.
  await cell.locator(".cc-n").hover();
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
  const revertedWidth = (await statusTh.boundingBox())!.width;
  expect(Math.abs(revertedWidth - originalWidth)).toBeLessThan(2);
});

test("project calendar — dragging a column header reorders the table", async ({ page, frank }) => {
  // Wide enough that Concept's header is on screen to drag (the Status
  // column is wider since 1.56.1).
  await page.setViewportSize({ width: 1600, height: 900 });
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
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
  await expect(viewSaveSplit(page).locator(".btn.primary").first()).toHaveText("Save as New View");
});

test("project calendar — hiding a column via the Columns picker also marks the view dirty", async ({
  page,
  frank,
}) => {
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  await page.waitForSelector(".tbl");

  await page.click('button:has-text("Columns")');
  await page.waitForSelector(".colpop");
  await page.getByRole("checkbox", { name: /^Show Concept/ }).click();
  await page.keyboard.press("Escape");

  await expect(viewSaveSplit(page).locator(".btn.primary").first()).toHaveText("Save as New View");
});

test("project calendar — a post past its date is red, and Pending opens its Edit window at that field", async ({ page, frank }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Past its Publish Date, in Client Review: not live (direct instruction: red).
  // Early today, so it's past whenever this runs and in the month the
  // table opens on.
  const early = new Date();
  early.setHours(0, 1, 0, 0);
  const thisMonth = early.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const past = await frank.createCreativeAtStage(4, "Past Due Post");
  await admin.from("creatives").update({ scheduled_at: early.toISOString() }).eq("id", past);
  await frank.loginAsStaff(page);
  await page.setViewportSize({ width: 2600, height: 700 });
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  // A future post's date isn't red.
  await goToMonth(page, "March 2027");
  await expect(page.locator("tr[data-row]", { hasText: "E2E Test Creative" }).locator("td.sk2")).not.toHaveClass(/tlate/);
  await page.reload();
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, thisMonth);
  await page.waitForSelector("td.skchk");
  const row = page.locator("tr[data-row]", { hasText: "Past Due Post" });
  await expect(row.locator("td.sk2")).toHaveClass(/tlate/);

  // Pending is a button for the team (direct instruction): the Edit window,
  // on the table, with the cursor in the Concept.
  // Each says what it adds (direct instruction).
  await expect(row.locator(".tpending-btn")).toHaveText([
    "Add Team",
    "Add Concept",
    "Add Notes",
    "Add Creative",
    "Add Text on Image",
    "Add Caption",
    "Add Alt Text",
    "Add Caption",
  ]);
  await row.getByRole("button", { name: "Add Concept", exact: true }).click();
  await expect(page.locator("#nbConcept")).toBeFocused();
  expect(page.url()).toContain(`/projects/${frank.projectId}`);
});

test("project calendar — a client sees Pending as words, not a button", async ({ page, frank }) => {
  await frank.loginAsClient(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  await page.waitForSelector(".tbl");
  await expect(page.locator(".tpending").first()).toBeVisible();
  await expect(page.locator(".tpending-btn")).toHaveCount(0);
});

test("project calendar — a post's date and time change from the table", async ({ page, frank }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  const row = page.locator("tr[data-row]", { hasText: "E2E Test Creative" });
  // Click the date (direct instruction): its pickers open under it.
  await row.getByRole("button", { name: "15 Mar 27" }).click();
  const pop = page.getByRole("dialog", { name: "E2E Test Creative's Publish Date" });
  await expect(pop.getByLabel("Publish Date")).toBeFocused();
  await pop.getByLabel("Publish Date").fill("2027-03-18");
  await pop.getByLabel("Time").fill("10:15");
  await pop.getByRole("button", { name: "Save" }).click();
  await expect(pop).toHaveCount(0);
  await expect(row.locator("td.sk2")).toHaveText("18 Mar 27");
  await expect(row).toContainText("10:15");
  const { data } = await admin.from("creatives").select("scheduled_at").eq("id", frank.creativeId).single();
  const at = new Date(data!.scheduled_at as string);
  expect([at.getDate(), at.getHours(), at.getMinutes()]).toEqual([18, 10, 15]);
  // Clicking the time opens it at the time; Cancel leaves it as it was.
  await row.getByRole("button", { name: "10:15" }).click();
  const again = page.getByRole("dialog", { name: "E2E Test Creative's Publish Date" });
  await expect(again.getByLabel("Time")).toBeFocused();
  // Its dropdown opens with it, over the buttons as the browser's did;
  // Escape closes only the dropdown.
  await expect(page.locator(".caldrop.caltime")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".caldrop")).toHaveCount(0);
  await again.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog", { name: /Publish Date/ })).toHaveCount(0);
  await expect(row).toContainText("10:15");
  // Frank's own dropdowns in the app's font (direct instruction): a day
  // from the calendar, a minute from the time's columns. Escape closes only
  // the dropdown.
  await row.getByRole("button", { name: "18 Mar 27" }).click();
  const third = page.getByRole("dialog", { name: "E2E Test Creative's Publish Date" });
  const cal = page.locator(".caldrop");
  await expect(cal.locator(".cal-title")).toHaveText("March 2027");
  expect(await cal.evaluate((e) => getComputedStyle(e).fontFamily)).toMatch(/^Urbanist/);
  await cal.getByRole("button", { name: "Monday, 22 March 2027" }).click();
  await expect(cal).toHaveCount(0);
  await expect(third.getByLabel("Publish Date")).toHaveValue("2027-03-22");
  await third.getByLabel("Time").click();
  await cal.locator(".cal-col[aria-label=Minute]").getByRole("button", { name: "40", exact: true }).click();
  await expect(third.getByLabel("Time")).toHaveValue("10:40");
  await third.getByLabel("Publish Date").click();
  await expect(cal).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(cal).toHaveCount(0);
  await third.getByRole("button", { name: "Save" }).click();
  await expect(third).toHaveCount(0);
  await expect(row.locator("td.sk2")).toHaveText("22 Mar 27");
  await expect(row).toContainText("10:40");
});

test("project calendar — a client's dates aren't buttons", async ({ page, frank }) => {
  await frank.loginAsClient(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  await expect(page.locator("td.sk2").first()).toHaveText("15 Mar 27");
  await expect(page.locator(".tdate-btn")).toHaveCount(0);
});

test("project calendar — a filled cell's Edit opens the post at that field", async ({ page, frank }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await admin
    .from("creatives")
    .update({ format: "ig_feed", formats: ["ig_feed", "ig_reel"], concept: "A dad on the night feed.", voiceover: "It's 3am.", slide_text: ["Night feeds"] })
    .eq("id", frank.creativeId);
  await frank.createCopyVersion(frank.creativeId, 1, { caption: "Testing" });
  await frank.loginAsStaff(page);
  await page.setViewportSize({ width: 2600, height: 800 });
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  const row = page.locator("tr[data-row]", { hasText: "E2E Test Creative" });
  // Post Name, Concept, VO, Text on Image and Caption/Copy (direct
  // instruction); the copy's own button just says Copy.
  await expect(row.locator(".tedit-btn")).toHaveCount(5);
  await expect(row.locator(".copychip:not(.tedit-btn)")).toHaveText(["Copy"]);
  for (const [title, field] of [
    ["Edit the Post Name", "#nbName"],
    ["Edit the VO", "#nbVo"],
    ["Edit the Caption/Copy", '[data-focus="copy"] textarea'],
  ]) {
    await row.locator(`.tedit-btn[title="${title}"]`).click();
    await expect(page.locator(field).first()).toBeFocused();
    expect(page.url()).toContain(`/projects/${frank.projectId}`);
    await page.getByRole("button", { name: "Cancel" }).last().click();
    await expect(page.locator(".scrim")).toHaveCount(0);
  }
});
