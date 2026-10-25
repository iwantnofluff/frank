import { test, expect } from "./fixtures";

test("creates a scheduled project end to end and lands on its page", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/clients/${frank.clientId}`);
  await page.waitForSelector(".clients, .empty");

  await page.click('button:has-text("New Project")');
  await page.fill("#newName", "New Project E2E — Scheduled");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Create" }).click();

  await page.waitForURL(/\/projects\/.+/);
  await expect(page.locator(".h1", { hasText: "New Project E2E — Scheduled" })).toBeVisible();
});

test("creates a continuous project with its type", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/clients/${frank.clientId}`);
  await page.waitForSelector(".clients, .empty");

  await page.click('button:has-text("New Project")');
  await page.click('.kopt:has-text("Other Content")');
  await expect(page.locator("#newType")).toHaveValue("Amazon");
  await page.fill("#newName", "New Project E2E — Continuous");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Create" }).click();

  await page.waitForURL(/\/projects\/.+/);
  await expect(page.locator(".h1", { hasText: "New Project E2E — Continuous" })).toBeVisible();
});

test("missing name is caught before submit", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`/clients/${frank.clientId}`);
  await page.waitForSelector(".clients, .empty");

  await page.click('button:has-text("New Project")');
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.locator(".autherr", { hasText: "Give it a name first" })).toBeVisible();
  await expect(page.locator(".scrim")).toHaveCount(1);
});

test("a real client-role session has no New Project entry point", async ({ page, frank }) => {
  await frank.loginAsClient(page);
  await page.goto(`/clients/${frank.clientId}`);
  await page.waitForSelector(".clients, .empty");

  await expect(page.locator('button:has-text("New Project")')).toHaveCount(0);
});

// A project's columns (phase96, direct instruction): chosen in the New
// Project window's second step, all ticked to start; columns of its own
// added there or later from the Columns picker, by Owners and Admins; and
// filled in from a post's window.
test("a new project's columns: untick defaults, add its own, fill them in on a post", async ({ page, frank }) => {
  test.setTimeout(120_000);
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  await admin.from("memberships").update({ role: "owner" }).eq("user_id", staffId).eq("agency_id", frank.agencyId);

  await frank.loginAsStaff(page);
  await page.goto(`/clients/${frank.clientId}`);
  await page.waitForSelector(".clients, .empty");
  await page.click('button:has-text("New Project")');
  await page.fill("#newName", "Columns E2E");
  await page.getByRole("button", { name: "Next" }).click();

  // Every column ticked to start.
  const group = page.getByRole("group", { name: "Columns" });
  const boxes = group.getByRole("checkbox");
  const total = await boxes.count();
  expect(total).toBeGreaterThan(10);
  for (let i = 0; i < total; i++) await expect(boxes.nth(i)).toBeChecked();
  await page.getByLabel("Show Time").uncheck();
  // Each column's type shows beside it.
  await expect(group.locator(".coled-row", { has: page.getByLabel("Show Status") }).locator(".coled-type")).toHaveText("Stage");
  // Rename a built-in column, and drag Copy above VO.
  const copyName = page.getByLabel("Name of Caption/Copy");
  await copyName.fill("Caption");
  await copyName.press("Enter");
  await expect(page.getByLabel("Show Caption")).toBeVisible();
  const rows = group.locator(".coled-row");
  await rows.filter({ has: page.getByLabel("Show Caption") }).locator(".coled-grip").dragTo(rows.filter({ has: page.getByLabel("Show VO") }));

  // Two of its own: Thumbnail Text, shown; Shoot Date, hidden.
  await page.getByRole("button", { name: "+ Add Column" }).click();
  await page.getByLabel("Column name").fill("Thumbnail Text");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "+ Add Column" }).click();
  await page.getByLabel("Column name").fill("Shoot Date");
  await page.getByLabel("What it records").selectOption("date");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByLabel("Show Shoot Date").uncheck();
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForURL(/\/projects\/.+/);

  const projectId = page.url().split("/projects/")[1].split(/[?#]/)[0];
  const { data: cols } = await admin.from("custom_columns").select("id, label, type").eq("project_id", projectId).order("position");
  expect(cols!.map((c) => [c.label, c.type])).toEqual([["Thumbnail Text", "text"], ["Shoot Date", "date"]]);
  const shoot = cols!.find((c) => c.label === "Shoot Date")!;
  const { data: proj } = await admin.from("projects").select("default_hidden_columns, default_column_order, column_labels").eq("id", projectId).single();
  expect(proj!.default_hidden_columns.sort()).toEqual(["time", `cx:${shoot.id}`].sort());
  expect(proj!.column_labels).toEqual({ postCopy: "Caption" });
  const order = proj!.default_column_order as string[];
  expect(order.indexOf("postCopy")).toBe(order.indexOf("voiceover") - 1);
  expect(proj!.default_column_order.slice(-2)).toEqual(cols!.map((c) => `cx:${c.id}`));
  // The table starts as set: Caption renamed and above VO; Time hidden.
  await page.waitForSelector(".tbl, .empty");

  // Later, from the table's Columns picker: a Large Text column.
  await page.getByRole("button", { name: /^Columns/ }).click();
  const pop = page.locator(".colpop");
  await pop.getByRole("button", { name: "+ Add Column" }).click();
  await pop.getByLabel("Column name").fill("Long Notes");
  await pop.getByLabel("What it records").selectOption("long_text");
  await pop.getByRole("button", { name: "Add", exact: true }).click();
  await expect
    .poll(async () => (await admin.from("custom_columns").select("type").eq("project_id", projectId).eq("label", "Long Notes").maybeSingle()).data?.type, { timeout: 15_000 })
    .toBe("long_text");
  // Renaming there changes the project's column; dragging reorders the table.
  const thumbName = pop.getByLabel("Name of Thumbnail Text");
  await thumbName.fill("Thumb Text");
  await thumbName.press("Enter");
  await expect.poll(async () => (await admin.from("custom_columns").select("label").eq("id", cols![0].id).single()).data?.label).toBe("Thumb Text");
  // Escape puts a name back and leaves the picker open.
  const renamed = pop.getByLabel("Name of Thumb Text");
  await renamed.fill("Not this");
  await renamed.press("Escape");
  await expect(renamed).toHaveValue("Thumb Text");
  const popRows = pop.locator(".coled-row");
  const names = async () => (await popRows.locator(".coled-name").evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value || e.textContent)));
  await expect.poll(async () => (await names()).slice(-3)).toEqual(["Thumb Text", "Shoot Date", "Long Notes"]);
  await popRows.filter({ has: page.getByLabel("Show Shoot Date") }).locator(".coled-grip").dragTo(popRows.filter({ has: page.getByLabel("Show Thumb Text") }));
  await expect.poll(async () => (await names()).slice(-3)).toEqual(["Shoot Date", "Thumb Text", "Long Notes"]);
  // Escape didn't save the discarded name, even once the field lost focus.
  expect((await admin.from("custom_columns").select("label").eq("id", cols![0].id).single()).data?.label).toBe("Thumb Text");

  // A User can't add one (the database refuses).
  await admin.from("memberships").update({ role: "user" }).eq("user_id", staffId).eq("agency_id", frank.agencyId);
  const u = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await u.auth.signInWithPassword({ email: frank.staffEmail, password: frank.staffPassword });
  const refused = await u.from("custom_columns").insert({ project_id: projectId, key: "x", label: "By a User", type: "text" }).select("id");
  expect(refused.error).not.toBeNull();
});

