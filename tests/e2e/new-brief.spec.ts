import { test, expect, goToMonth, chooseFormat } from "./fixtures";

// This is the first code path in the app that creates a creatives row —
// verified empirically against real staff/client sessions before the form
// was built (docs/parity-gaps.md, "New Brief"). These specs exercise the
// actual form on top of that verified basis.

test("creates a scheduled creative end to end", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");

  await page.getByRole("button", { name: "New Post", exact: true }).click();
  await page.fill("#nbName", "New Brief E2E — Scheduled");
  await page.fill("#nbDate", "2027-04-01");
  await chooseFormat(page);
  await page.click('button:has-text("Create Post")');

  // CreativeModal stays open on success rather than closing — creating the
  // brief unlocks the Content tab in the same window (the merge that
  // replaced New Brief / Upload or Edit / Draft from Brief as three
  // separate entry points), and goes straight to it (direct instruction).
  await expect(page.getByRole("tab", { name: "Content" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".msection-h", { hasText: /^Creative$/ })).toBeVisible();
  await page.click('button:has-text("Cancel")');
  await expect(page.locator(".scrim")).toHaveCount(0);
  await expect(page.locator(".pname", { hasText: "New Brief E2E — Scheduled" })).toBeVisible();
});

test("creates a continuous creative end to end", async ({ page, frank }) => {
  const continuousProjectId = await frank.createContinuousProject();
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${continuousProjectId}`);
  await page.waitForSelector(".tblwrap, .empty");

  await page.getByRole("button", { name: "New Post", exact: true }).click();
  await page.fill("#nbName", "New Brief E2E — Continuous");
  // No Destination any more (direct instruction).
  await expect(page.locator("#nbDest")).toHaveCount(0);
  // due_on is optional at the schema/form level, but ContinuousCalendarTable
  // (like ProjectCalendarTable's own scheduled_at) only shows a creative
  // that has one — fill it so this brief actually appears afterward.
  await page.fill("#nbDue", "2027-04-01");
  await chooseFormat(page, "A+ Content Module");
  await page.click('button:has-text("Create Post")');

  await expect(page.getByRole("tab", { name: "Content" })).toBeEnabled();
  await page.click('button:has-text("Cancel")');
  await expect(page.locator(".scrim")).toHaveCount(0);
  await expect(page.locator(".pname", { hasText: "New Brief E2E — Continuous" })).toBeVisible();
});

test("a post saved with no publish date is made as an Idea", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");

  await page.getByRole("button", { name: "New Post", exact: true }).click();
  await page.fill("#nbName", "Pumpkin Bread Idea");
  // No format yet (a new post starts with none), and that's fine too
  // (phase114, direct instruction): an idea needs neither.
  await expect(page.locator("#nbFmt")).toHaveText("Choose formats");
  await page.click('button:has-text("Create Post")');

  // No Publish Date is fine: it's made as an Idea (direct instruction),
  // under the weeks.
  await expect(page.getByRole("tab", { name: "Content" })).toHaveAttribute("aria-selected", "true");
  await page.click('button:has-text("Cancel")');
  await expect(page.locator(".scrim")).toHaveCount(0);
  const row = page.locator("tr[data-row]", { hasText: "Pumpkin Bread Idea" });
  await expect(row.locator(".stg.idea")).toHaveText(/^0\.\s*Idea$/);
  await expect(page.locator("tr.ideaband")).toContainText("1 Idea");

  // Its Format cell offers Add Format, opening it at the picker; the
  // Content tab, until then, says to choose one first.
  await row.getByRole("button", { name: "Add Format" }).click();
  await expect(page.getByRole("tab", { name: "Brief" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#nbFmt")).toBeFocused();
  await page.getByRole("tab", { name: "Content" }).click();
  await expect(page.getByText("Choose a Format First")).toBeVisible();
  await page.getByRole("button", { name: "Choose a Format" }).click();
  // It opens the Brief's picker.
  const pop = page.getByRole("dialog", { name: "Formats" });
  await pop.getByRole("checkbox", { name: "Instagram Post" }).click();
  await pop.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Update" }).click();
  await expect(page.getByText("Post updated.")).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await expect(row.getByRole("button", { name: "Add Format" })).toHaveCount(0);
  await expect(row).toContainText("Instagram");
});

test("a real client-role session has no New Brief entry point", async ({ page, frank }) => {
  await frank.loginAsClient(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");

  await expect(page.getByRole("button", { name: "New Post", exact: true })).toHaveCount(0);
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

  await page.getByRole("button", { name: "New Post", exact: true }).click();
  await page.fill("#nbName", "Multi Format E2E");
  await page.fill("#nbDate", "2027-04-01");
  // Nothing ticked to start (direct instruction); formats from two content
  // types, the first ticked the main one.
  await expect(page.locator("#nbFmt")).toHaveText("Choose formats");
  await page.click("#nbFmt");
  const pop = page.getByRole("dialog", { name: "Formats" });
  await pop.getByRole("checkbox", { name: "Meta Feed Ad" }).click();
  await pop.getByRole("checkbox", { name: "Instagram Post" }).click();
  // On a new post the last one can be unticked too.
  await pop.getByRole("checkbox", { name: "Meta Feed Ad" }).click();
  await pop.getByRole("checkbox", { name: "Instagram Post" }).click();
  await expect(pop.getByRole("checkbox", { name: "Meta Feed Ad" })).toHaveAttribute("aria-checked", "false");
  await pop.getByRole("checkbox", { name: "Meta Feed Ad" }).click();
  await pop.getByRole("checkbox", { name: "Instagram Post" }).click();
  // Done closes it (direct instruction).
  await pop.getByRole("button", { name: "Done" }).click();
  await expect(pop).toHaveCount(0);
  await expect(page.locator(".scrim")).toHaveCount(1);
  await expect(page.locator("#nbFmt")).toHaveText("Meta Feed Ad + Instagram Post");
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

  await expect(page.locator("tr", { hasText: "Multi Format E2E" })).toContainText("Meta Feed Ad + Instagram Post");
});

test("a post takes several references, each a link in the table and on its Brief", async ({ page, frank }) => {
  test.setTimeout(60_000);
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.getByRole("button", { name: "New Post", exact: true }).click();
  await page.fill("#nbName", "References E2E");
  await page.fill("#nbDate", "2027-03-16");
  await page.getByRole("textbox", { name: "Reference 1" }).fill("example.com/first");
  await page.getByRole("button", { name: "+ Add Reference" }).click();
  await page.getByRole("textbox", { name: "Reference 2" }).fill("https://example.com/second");
  // A blank third one is dropped on save.
  await page.getByRole("button", { name: "+ Add Reference" }).click();
  await expect(page.getByRole("link", { name: "Open reference 1" })).toHaveAttribute("href", "https://example.com/first");
  await chooseFormat(page);
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

test("a post page's + New opens the New Post window on its project's table", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${frank.creativeId}`);
  const button = page.getByRole("button", { name: "New Post", exact: true });
  await expect(button).toHaveText("+ New");
  await button.click();
  // The table, with the window open (direct instruction), the address
  // back to the project's own so a reload doesn't open it again.
  await expect(page.locator("#nbName")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".tblwrap, .empty").first()).toBeAttached();
  await expect(page).toHaveURL(new RegExp(`/projects/${frank.projectId}$`));
  // The table's own button says + New too, its menu's Row Quick add in row.
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("button", { name: "New Post", exact: true })).toHaveText("+ New");
  await page.getByRole("button", { name: "How to add it" }).click();
  await expect(page.getByRole("menuitem", { name: /^Row/ })).toContainText("Quick add in row");
});

// Made by speaking (direct instruction). The browser's speech-to-text is
// stood in for (a test browser has no microphone), and so is the AI's
// reply (never a live one in a permanent test): what's checked is that
// what was heard goes to Frank, and what comes back fills the form, with
// nothing saved until Create Post.
test("a post made by speaking fills in the New Post window", async ({ page, frank }) => {
  const said = "A carousel on the twentieth of November at nine, five slides, a dad doing the night feed";
  await page.addInitScript((words) => {
    class FakeRecognition {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        setTimeout(() => this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: words }], { isFinal: true })] }), 200);
      }
      stop() {
        setTimeout(() => this.onend?.(), 50);
      }
      abort() {}
    }
    (window as unknown as Record<string, unknown>).SpeechRecognition = FakeRecognition;
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition;
  }, said);
  let sent: { transcript?: string; delivery?: string } = {};
  await page.route("**/api/ai/voice-post", async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({
      json: {
        fields: {
          name: "Dad Does the Night Feed",
          formats: ["ig_carousel"],
          slideCount: 5,
          date: "2026-11-20",
          time: "09:00",
          concept: "A dad doing the night feed.",
        },
      },
    });
  });
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.getByRole("button", { name: "New Post", exact: true }).click();
  await page.getByRole("button", { name: "Speak It" }).click();
  await expect(page.locator(".voicepost-live")).toContainText("night feed");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.locator(".voicepost-note")).toContainText("Filled in from what you said");
  expect(sent).toMatchObject({ transcript: said, delivery: "scheduled" });
  await expect(page.locator("#nbName")).toHaveValue("Dad Does the Night Feed");
  await expect(page.locator("#nbFmt")).toHaveText("Instagram Carousel");
  await expect(page.locator("#nbSlides")).toHaveValue("5");
  await expect(page.locator("#nbDate")).toHaveValue("2026-11-20");
  await expect(page.locator("#nbTime")).toHaveValue("09:00");
  await expect(page.locator("#nbConcept")).toHaveValue("A dad doing the night feed.");
  // Nothing saved yet.
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await admin.from("creatives").select("id").eq("project_id", frank.projectId).eq("name", "Dad Does the Night Feed");
  expect(data).toEqual([]);
});

test("a post's Team offers only the project's team: a User not added to it isn't offered", async ({ page, frank }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // Two Users who've joined the agency (the reserved .invalid domain, so
  // the fixture's teardown sweeps them): one given this client, so on its
  // projects; one not.
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const make = async (name: string) => {
    const email = `e2e-user-${name.toLowerCase()}-${stamp}@example.invalid`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: "E2e-User-Test-1234!", email_confirm: true });
    if (error) throw error;
    await admin.from("users").insert({ id: data.user.id, email, name: `${name} User` });
    const { data: m, error: mError } = await admin
      .from("memberships")
      .insert({ agency_id: frank.agencyId, user_id: data.user.id, role: "user", accepted_at: new Date().toISOString() })
      .select("id")
      .single();
    if (mError) throw mError;
    return m.id as string;
  };
  const onClient = await make("Onproject");
  await make("Offproject");
  const { error } = await admin.from("staff_client_access").insert({ agency_id: frank.agencyId, membership_id: onClient, client_id: frank.clientId });
  if (error) throw error;

  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await page.getByRole("button", { name: "New Post", exact: true }).click();
  // The fixture's Admin (on every project) and the User added to it; never
  // the one who isn't (direct instruction).
  const add = page.getByLabel("Add someone to this post's team");
  await expect(add.locator("option")).toHaveText(["Nobody yet: + Add someone", "E2E Staff", "Onproject User"]);
});
