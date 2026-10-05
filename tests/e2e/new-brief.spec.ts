import { test, expect, goToMonth } from "./fixtures";

// This is the first code path in the app that creates a creatives row —
// verified empirically against real staff/client sessions before the form
// was built (docs/parity-gaps.md, "New Brief"). These specs exercise the
// actual form on top of that verified basis.

test("creates a scheduled creative end to end", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");

  await page.click('button:has-text("New Post")');
  await page.fill("#nbName", "New Brief E2E — Scheduled");
  await page.fill("#nbDate", "2027-04-01");
  await page.click('button:has-text("Create Post")');

  // CreativeModal stays open on success rather than closing — creating the
  // brief unlocks the Content tab in the same window (the merge that
  // replaced New Brief / Upload or Edit / Draft from Brief as three
  // separate entry points), so there's something to switch to.
  await expect(page.getByRole("tab", { name: "Content" })).toBeEnabled();
  await page.click('button:has-text("Cancel")');
  await expect(page.locator(".scrim")).toHaveCount(0);
  await expect(page.locator(".pname", { hasText: "New Brief E2E — Scheduled" })).toBeVisible();
});

test("creates a continuous creative end to end", async ({ page, frank }) => {
  const continuousProjectId = await frank.createContinuousProject();
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${continuousProjectId}`);
  await page.waitForSelector(".tblwrap, .empty");

  await page.click('button:has-text("New Post")');
  await page.fill("#nbName", "New Brief E2E — Continuous");
  await page.fill("#nbDest", "https://example.com/listing");
  // due_on is optional at the schema/form level, but ContinuousCalendarTable
  // (like ProjectCalendarTable's own scheduled_at) only shows a creative
  // that has one — fill it so this brief actually appears afterward.
  await page.fill("#nbDue", "2027-04-01");
  await page.click('button:has-text("Create Post")');

  await expect(page.getByRole("tab", { name: "Content" })).toBeEnabled();
  await page.click('button:has-text("Cancel")');
  await expect(page.locator(".scrim")).toHaveCount(0);
  await expect(page.locator(".pname", { hasText: "New Brief E2E — Continuous" })).toBeVisible();
});

test("missing publish date is caught before submit, not by the DB trigger", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");

  await page.click('button:has-text("New Post")');
  await page.fill("#nbName", "Should Not Be Created");
  await page.click('button:has-text("Create Post")');

  // Field-level error, modal still open — the scheduled_at trigger never
  // gets a chance to be the thing the user meets.
  await expect(page.locator(".autherr", { hasText: "Pick a publish date" })).toBeVisible();
  await expect(page.locator(".scrim")).toHaveCount(1);
  await expect(page.locator(".pname", { hasText: "Should Not Be Created" })).toHaveCount(0);
});

test("a real client-role session has no New Brief entry point", async ({ page, frank }) => {
  await frank.loginAsClient(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");

  await expect(page.locator('button:has-text("New Post")')).toHaveCount(0);
});

test("a post can have several formats, with all their copy fields, and closes with copy only", async ({ page, frank }) => {
  test.setTimeout(60_000);
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");

  await page.click('button:has-text("New Post")');
  await page.fill("#nbName", "Multi Format E2E");
  await page.fill("#nbDate", "2027-04-01");
  // Instagram Feed is ticked by default; add a format from another content type.
  await expect(page.locator("#nbFmt")).toHaveText("Instagram Feed");
  await page.click("#nbFmt");
  const pop = page.getByRole("dialog", { name: "Formats" });
  await pop.getByRole("checkbox", { name: "Meta Feed Ad" }).click();
  // The last one left can't be unticked.
  await pop.getByRole("checkbox", { name: "Instagram Feed" }).click();
  await pop.getByRole("checkbox", { name: "Meta Feed Ad" }).click();
  await expect(pop.getByRole("checkbox", { name: "Meta Feed Ad" })).toHaveAttribute("aria-checked", "true");
  await pop.getByRole("checkbox", { name: "Instagram Feed" }).click();
  await page.keyboard.press("Escape");
  await expect(pop).toHaveCount(0);
  await expect(page.locator(".scrim")).toHaveCount(1);
  await expect(page.locator("#nbFmt")).toHaveText("Meta Feed Ad + Instagram Feed");
  await page.click('button:has-text("Create Post")');
  await expect(page.getByRole("tab", { name: "Content" })).toBeEnabled();

  const row = async () =>
    (await admin.from("creatives").select("format, formats").eq("project_id", frank.projectId).eq("name", "Multi Format E2E").single()).data!;
  expect(await row()).toEqual({ format: "meta_feed", formats: ["meta_feed", "ig_feed"] });

  // Every chosen format's copy fields, each once.
  await page.getByRole("tab", { name: "Content" }).click();
  const labels = page.locator(".mtabbody .field > label");
  for (const l of ["Primary Text", "Headline", "Description", "Call to Action", "Caption", "Alt Text"]) {
    await expect(labels.filter({ hasText: new RegExp(`^${l}$`) })).toHaveCount(1);
  }

  // Copy only, no artwork: saving the version and then Save and Close closes.
  await page.locator(".mtabbody .field > textarea.bin").first().fill("Copy with no creative yet.");
  await page.getByRole("button", { name: "Save Copy V1" }).click();
  await expect(page.getByText("Saved as version 1.")).toBeVisible();
  await page.getByRole("button", { name: "Save and Close" }).click();
  await expect(page.locator(".scrim")).toHaveCount(0);

  await expect(page.locator("tr", { hasText: "Multi Format E2E" })).toContainText("Meta Feed Ad + Instagram Feed");
});

test("a post takes several references, each a link in the table and on its Brief", async ({ page, frank }) => {
  test.setTimeout(60_000);
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.click('button:has-text("New Post")');
  await page.fill("#nbName", "References E2E");
  await page.fill("#nbDate", "2027-03-16");
  await page.getByRole("textbox", { name: "Reference 1" }).fill("example.com/first");
  await page.getByRole("button", { name: "+ Add Reference" }).click();
  await page.getByRole("textbox", { name: "Reference 2" }).fill("https://example.com/second");
  // A blank third one is dropped on save.
  await page.getByRole("button", { name: "+ Add Reference" }).click();
  await expect(page.getByRole("link", { name: "Open reference 1" })).toHaveAttribute("href", "https://example.com/first");
  await page.click('button:has-text("Create Post")');
  await expect(page.getByRole("tab", { name: "Content" })).toBeEnabled();
  const { data: c } = await admin
    .from("creatives")
    .select("id, reference_urls")
    .eq("project_id", frank.projectId)
    .eq("name", "References E2E")
    .single();
  expect(c!.reference_urls).toEqual(["example.com/first", "https://example.com/second"]);

  await page.click('button:has-text("Cancel")');
  await goToMonth(page, "March 2027");
  const row = page.locator("tr[data-row]", { hasText: "References E2E" });
  const first = row.getByRole("link", { name: "example.com/first" });
  await expect(first).toHaveAttribute("href", "https://example.com/first");
  await expect(first).toHaveAttribute("target", "_blank");
  await expect(row.getByRole("link", { name: "https://example.com/second" })).toBeVisible();
  // Opening a reference doesn't open the post as well.
  const [tab] = await Promise.all([page.context().waitForEvent("page"), first.click()]);
  await tab.close();
  expect(page.url()).toContain(`/projects/${frank.projectId}`);

  await page.goto(`/creatives/${c!.id}`);
  await page.getByRole("button", { name: "Brief", exact: true }).click();
  await expect(page.getByRole("link", { name: "https://example.com/second" })).toHaveAttribute("href", "https://example.com/second");
});
