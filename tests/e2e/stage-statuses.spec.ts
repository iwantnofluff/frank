import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";

// Statuses within each stage (phase123; the agency's and its clients' since
// phase151, direct instruction): the agency's list in Settings → Statuses,
// every client's unless it has its own in its Client Settings; Owners and
// Admins change them; a post takes its stage's first and the team picks
// another from the stage pill, on the post or in the table (3a, 3b…);
// clients never see them.
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const statuses = async (agencyId: string, clientId: string | null = null) => {
  const q = admin.from("stage_statuses").select("id, stage, label, position, hides_post").eq("agency_id", agencyId);
  return (await (clientId ? q.eq("client_id", clientId) : q.is("client_id", null)).order("stage").order("position")).data!;
};

test("an agency starts with the statuses; an Admin adds, renames, moves and removes them in any stage; a User reads them", async ({ page, frank }) => {
  test.setTimeout(120_000);
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  const setRole = (role: string) => admin.from("memberships").update({ role }).eq("user_id", staffId).eq("agency_id", frank.agencyId).select("id").single();
  expect((await statuses(frank.agencyId)).map((s) => `${s.stage} ${s.label}`)).toEqual([
    "2 In Progress (Content)",
    "2 In Progress (Creative)",
    "3 Internal QC (Copy)",
    "3 Internal QC (Creative)",
    "3 Hold",
    "3 Cancel",
  ]);

  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/settings/general/statuses`);
  const internal = page.getByRole("group", { name: "Internal Review" });
  await expect(internal.getByLabel("Name of Hold")).toHaveValue("Hold", { timeout: 20_000 });
  // The four new stages start empty.
  const approved = page.getByRole("group", { name: "Approved" });
  await expect(approved).toContainText("No statuses: posts here show the stage alone.");

  // Added in Approved, at the end; it can't hide its posts there.
  await approved.getByRole("button", { name: "Add Status" }).click();
  await approved.getByLabel("New Approved status").fill("Ready to Schedule");
  await approved.getByRole("button", { name: "Add", exact: true }).click();
  await expect(approved.getByLabel("Name of Ready to Schedule")).toBeVisible();
  await expect(approved.getByRole("checkbox", { name: "Hides its posts" })).toHaveCount(0);
  await expect(internal.getByRole("checkbox", { name: "Hides its posts" })).toHaveCount(4);
  // Nor through the database.
  const ready = (await statuses(frank.agencyId)).find((s) => s.label === "Ready to Schedule")!;
  expect((await admin.from("stage_statuses").update({ hides_post: true }).eq("id", ready.id)).error?.message).toContain("stage_statuses_hides_check");

  // Renamed in place; Escape puts a name back and doesn't save it.
  await internal.getByRole("button", { name: "Add Status" }).click();
  await internal.getByLabel("New Internal Review status").fill("Waiting on legal");
  await internal.getByRole("button", { name: "Add", exact: true }).click();
  const name = internal.getByLabel("Name of Waiting on legal");
  await name.fill("Legal check");
  await name.press("Enter");
  await expect.poll(async () => (await statuses(frank.agencyId)).some((s) => s.label === "Legal check")).toBe(true);
  const legal = internal.getByLabel("Name of Legal check");
  await legal.fill("Not this");
  await legal.press("Escape");
  await expect(legal).toHaveValue("Legal check");
  await internal.getByRole("button", { name: "Move Cancel up" }).click();
  await expect.poll(async () => (await statuses(frank.agencyId)).filter((s) => s.stage === 3).map((s) => s.label)).toEqual([
    "Internal QC (Copy)",
    "Internal QC (Creative)",
    "Cancel",
    "Hold",
    "Legal check",
  ]);

  // A post entering Approved takes its first.
  await admin.from("creatives").update({ stage: 5 }).eq("id", frank.creativeId);
  expect((await admin.from("creatives").select("status_id").eq("id", frank.creativeId).single()).data!.status_id).toBe(ready.id);

  // Removed with a post on it: the post moves to the stage's first.
  await admin.from("creatives").update({ stage: 3 }).eq("id", frank.creativeId);
  const hold = (await statuses(frank.agencyId)).find((s) => s.label === "Hold")!;
  await admin.from("creatives").update({ status_id: hold.id }).eq("id", frank.creativeId);
  await internal.getByRole("button", { name: "Remove Hold" }).click();
  const dialog = page.getByRole("dialog", { name: "Remove Hold?" });
  await expect(dialog).toContainText("1 post is on it, and will move to the first status left in Internal Review.");
  await dialog.getByRole("button", { name: "Remove" }).click();
  await expect(internal.getByLabel("Name of Hold")).toHaveCount(0);
  const first = (await statuses(frank.agencyId)).find((s) => s.label === "Internal QC (Copy)")!;
  expect((await admin.from("creatives").select("status_id").eq("id", frank.creativeId).single()).data!.status_id).toBe(first.id);

  // The project's Settings say where they're set.
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByText("This project uses E2E Test Client’s statuses, set in its Client Settings.")).toBeVisible();

  // A User reads them, and can't change them.
  const { data: m } = await setRole("user");
  await admin.from("staff_client_access").insert({ membership_id: m!.id, client_id: frank.clientId });
  await page.goto(`${APP_URL}/settings/general/statuses`);
  await expect(page.getByRole("group", { name: "Internal Review" }).getByText("Legal check")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Add Status" })).toHaveCount(0);
  const u = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await u.auth.signInWithPassword({ email: frank.staffEmail, password: frank.staffPassword });
  expect((await u.from("stage_statuses").update({ label: "By a User" }).eq("id", first.id).select("id")).data ?? []).toHaveLength(0);
  expect((await u.rpc("set_client_own_statuses", { p_client_id: frank.clientId, p_own: true })).error?.message).toContain("Only Owners and Admins");
});

test("a client switches to its own statuses and back, its posts following by name", async ({ page, frank }) => {
  test.setTimeout(120_000);
  const agencyList = await statuses(frank.agencyId);
  const hold = agencyList.find((s) => s.label === "Hold")!;
  await admin.from("creatives").update({ stage: 3 }).eq("id", frank.creativeId);
  await admin.from("creatives").update({ status_id: hold.id }).eq("id", frank.creativeId);
  const now = async () => (await admin.from("creatives").select("status_id").eq("id", frank.creativeId).single()).data!.status_id;
  const before = (await admin.from("creatives").select("updated_at").eq("id", frank.creativeId).single()).data!.updated_at;

  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/clients/${frank.clientId}/settings/statuses`);
  await expect(page.getByText("E2E Test Client uses your agency’s statuses")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("group", { name: "Internal Review" })).toHaveCount(0);
  await page.getByRole("button", { name: "Use Its Own" }).click();

  // A copy of the agency's, the post on the copy of its status.
  const internal = page.getByRole("group", { name: "Internal Review" });
  await expect(internal.getByLabel("Name of Hold")).toBeVisible();
  const own = await statuses(frank.agencyId, frank.clientId);
  expect(own.map((s) => `${s.stage} ${s.label} ${s.hides_post}`)).toEqual(agencyList.map((s) => `${s.stage} ${s.label} ${s.hides_post}`));
  expect(await now()).toBe(own.find((s) => s.label === "Hold")!.id);
  // Not an edit anyone made: its Last Activity stays.
  expect((await admin.from("creatives").select("updated_at").eq("id", frank.creativeId).single()).data!.updated_at).toBe(before);

  // Changed for this client alone.
  const holdName = internal.getByLabel("Name of Hold");
  await holdName.fill("Paused");
  await holdName.press("Enter");
  await expect.poll(async () => (await statuses(frank.agencyId, frank.clientId)).some((s) => s.label === "Paused")).toBe(true);
  expect((await statuses(frank.agencyId)).some((s) => s.label === "Hold")).toBe(true);

  // On the post: its pill lists the client's.
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await expect(page.locator(".stagesw").getByRole("button", { name: "Status within the stage" })).toHaveText("3c. Paused", { timeout: 20_000 });

  // Back to the agency's: "Paused" has no match, so the stage's first.
  await page.goto(`${APP_URL}/clients/${frank.clientId}/settings/statuses`);
  await page.getByRole("button", { name: "Use the Agency’s" }).click();
  const dialog = page.getByRole("dialog", { name: "Use the Agency's Statuses?" });
  await dialog.getByRole("button", { name: "Use the Agency's" }).click();
  await expect(page.getByText("E2E Test Client uses your agency’s statuses")).toBeVisible();
  expect(await statuses(frank.agencyId, frank.clientId)).toEqual([]);
  expect(await now()).toBe(agencyList.find((s) => s.label === "Internal QC (Copy)")!.id);
});

test("a post takes its stage's first status, the team picks another from its pill in any stage, the table's pill moves it anywhere, and a client sees none", async ({ page, browser, frank }) => {
  test.setTimeout(120_000);
  // A status in Client Review too (phase151): the team's only.
  await admin.from("stage_statuses").insert({ agency_id: frank.agencyId, stage: 4, label: "Chased Once", position: 0 });
  const list = await statuses(frank.agencyId);
  const id = (label: string) => list.find((s) => s.label === label)!.id;
  const now = async () => (await admin.from("creatives").select("stage, status_id").eq("id", frank.creativeId).single()).data!;
  // Into Internal Review: the first status, set by the database.
  await admin.from("creatives").update({ stage: 3, scheduled_at: new Date().toISOString() }).eq("id", frank.creativeId);
  expect((await now()).status_id).toBe(id("Internal QC (Copy)"));

  // On the post: the active pill opens below it, the stage first, then its statuses only.
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const postPill = page.locator(".stagesw").getByRole("button", { name: "Status within the stage" });
  await expect(postPill).toHaveText("3a. Internal QC (Copy)");
  await postPill.click();
  const menu = page.getByRole("listbox", { name: "Status within the stage" });
  await expect(menu.getByRole("option")).toHaveText(["3. Internal", "3a. Internal QC (Copy)", "3b. Internal QC (Creative)", "3c. Hold", "3d. Cancel"]);
  const pill = (await postPill.boundingBox())!;
  expect((await menu.boundingBox())!.y).toBeGreaterThanOrEqual(pill.y + pill.height);
  await menu.getByRole("option", { name: "3c. Hold" }).click();
  await expect.poll(async () => (await now()).status_id).toBe(id("Hold"));

  // In the table: every stage and status, and a post moves to any.
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  const tablePill = page.getByRole("button", { name: "Status of E2E Test Creative" });
  await expect(tablePill).toHaveText("3c. Hold", { timeout: 20_000 });
  const pick = async (text: string) => {
    await tablePill.click();
    await page.getByRole("listbox", { name: "Status of E2E Test Creative" }).getByRole("option", { name: text, exact: true }).click();
  };
  await tablePill.click();
  await expect(page.getByRole("listbox").getByRole("option")).toHaveText([
    "1. Concept",
    "2. In Production",
    "2a. In Progress (Content)",
    "2b. In Progress (Creative)",
    "3. Internal Review",
    "3a. Internal QC (Copy)",
    "3b. Internal QC (Creative)",
    "3c. Hold",
    "3d. Cancel",
    "4. Client Review",
    "4a. Chased Once",
    "5. Approved",
    "6. Live",
  ]);
  await page.keyboard.press("Escape");
  await pick("2b. In Progress (Creative)");
  await expect.poll(now).toEqual({ stage: 2, status_id: id("In Progress (Creative)") });
  await pick("3. Internal Review");
  await expect.poll(now).toEqual({ stage: 3, status_id: null });
  await pick("4a. Chased Once");
  await expect.poll(now).toEqual({ stage: 4, status_id: id("Chased Once") });
  await expect(tablePill).toHaveText("4a. Chased Once");

  // On the post, Client Review's pill opens its statuses.
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await expect(postPill).toHaveText("4a. Chased Once", { timeout: 20_000 });
  await postPill.click();
  await expect(menu.getByRole("option")).toHaveText(["4. Client", "4a. Chased Once"]);
  await menu.getByRole("option", { name: "4. Client" }).click();
  await expect.poll(now).toEqual({ stage: 4, status_id: null });
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  await expect(tablePill).toHaveText("4. Client Review", { timeout: 20_000 });
  // Settled first, as below: a click mid-load scrolls the table, closing the menu.
  await page.waitForLoadState("networkidle");

  // Still in Concept: the Concept is approved first, then it moves.
  await pick("1. Concept");
  await expect.poll(async () => (await now()).stage).toBe(1);
  await admin.from("creatives").update({ concept: "Autumn oats, slow mornings" }).eq("id", frank.creativeId);
  await page.reload();
  // The table settled first: Status sits right of Caption, Text on Image
  // and Creative since phase140, so a click mid-load scrolls the table to
  // it, and a scroll closes the menu.
  await expect(tablePill).toHaveText("1. Concept", { timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  await pick("2a. In Progress (Content)");
  const ask = page.getByRole("dialog", { name: "Approve the Concept first?" });
  await expect(ask).toContainText("then moves it to 2a. In Progress (Content).");
  await ask.getByRole("button", { name: "Approve Concept" }).click();
  await expect(ask).toHaveCount(0);
  await expect.poll(now).toEqual({ stage: 2, status_id: id("In Progress (Content)") });
  expect((await admin.from("comments").select("body").eq("creative_id", frank.creativeId)).data!.map((c) => c.body)).toContain("Approved Concept");

  // A client, in Client Review on a status: plain pills, no menu, and no
  // statuses to read.
  await admin.from("creatives").update({ stage: 4 }).eq("id", frank.creativeId);
  await admin.from("creatives").update({ status_id: id("Chased Once") }).eq("id", frank.creativeId);
  const clientPage = await (await browser.newContext()).newPage();
  await frank.loginAsClient(clientPage);
  await clientPage.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await expect(clientPage.locator(".stagesw.ro")).toBeVisible({ timeout: 20_000 });
  await expect(clientPage.getByRole("button", { name: "Status within the stage" })).toHaveCount(0);
  await expect(clientPage.getByText("Chased Once")).toHaveCount(0);
  await clientPage.goto(`${APP_URL}/projects/${frank.projectId}`);
  await expect(clientPage.locator("tr[data-row]").first()).toBeVisible({ timeout: 20_000 });
  await expect(clientPage.locator(".stg-pick")).toHaveCount(0);
  await expect(clientPage.locator("tr[data-row] .stg").first()).toContainText("Client Review");
  await expect(clientPage.getByText("Chased Once")).toHaveCount(0);
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email: frank.clientEmail, password: frank.clientPassword });
  expect((await c.from("stage_statuses").select("id")).data).toEqual([]);
});
