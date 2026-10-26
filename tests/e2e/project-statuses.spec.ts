import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";

// Statuses within In Production and Internal Review (phase123, direct
// instruction): each project's own list in its Settings, Owners and
// Admins changing it; a post takes its stage's first and the team picks
// another from the stage pill, on the post or in the table (3a, 3b…); clients
// never see them.
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const statuses = async (projectId: string) =>
  (await admin.from("project_statuses").select("id, stage, label, position").eq("project_id", projectId).order("stage").order("position")).data!;

test("a project starts with the statuses; an Admin adds, renames, moves and removes them; a User reads them", async ({ page, frank }) => {
  test.setTimeout(120_000);
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  const setRole = (role: string) => admin.from("memberships").update({ role }).eq("user_id", staffId).eq("agency_id", frank.agencyId).select("id").single();
  expect((await statuses(frank.projectId)).map((s) => `${s.stage} ${s.label}`)).toEqual([
    "2 In Progress (Content)",
    "2 In Progress (Creative)",
    "3 Internal QC (Copy)",
    "3 Internal QC (Creative)",
    "3 Hold",
    "3 Cancel",
  ]);

  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const internal = page.getByRole("group", { name: "Internal Review" });
  await expect(internal.getByLabel("Name of Hold")).toHaveValue("Hold");

  // Added at the end.
  await internal.getByRole("button", { name: "Add Status" }).click();
  await internal.getByLabel("New Internal Review status").fill("Waiting on legal");
  await internal.getByRole("button", { name: "Add", exact: true }).click();
  await expect(internal.getByLabel("Name of Waiting on legal")).toBeVisible();
  // Renamed in place; Escape puts a name back and doesn't save it.
  const name = internal.getByLabel("Name of Waiting on legal");
  await name.fill("Legal check");
  await name.press("Enter");
  await expect.poll(async () => (await statuses(frank.projectId)).some((s) => s.label === "Legal check")).toBe(true);
  const legal = internal.getByLabel("Name of Legal check");
  await legal.fill("Not this");
  await legal.press("Escape");
  await expect(legal).toHaveValue("Legal check");
  await internal.getByRole("button", { name: "Move Cancel up" }).click();
  // Moved up.
  await expect.poll(async () => (await statuses(frank.projectId)).filter((s) => s.stage === 3).map((s) => s.label)).toEqual([
    "Internal QC (Copy)",
    "Internal QC (Creative)",
    "Cancel",
    "Hold",
    "Legal check",
  ]);

  // Removed with a post on it: the post moves to the stage's first.
  await admin.from("creatives").update({ stage: 3 }).eq("id", frank.creativeId);
  const hold = (await statuses(frank.projectId)).find((s) => s.label === "Hold")!;
  await admin.from("creatives").update({ status_id: hold.id }).eq("id", frank.creativeId);
  await internal.getByRole("button", { name: "Remove Hold" }).click();
  const dialog = page.getByRole("dialog", { name: "Remove Hold?" });
  await expect(dialog).toContainText("1 post is on it, and will move to the first status left in Internal Review.");
  await dialog.getByRole("button", { name: "Remove" }).click();
  await expect(internal.getByLabel("Name of Hold")).toHaveCount(0);
  const first = (await statuses(frank.projectId)).find((s) => s.label === "Internal QC (Copy)")!;
  expect((await admin.from("creatives").select("status_id").eq("id", frank.creativeId).single()).data!.status_id).toBe(first.id);

  // A User reads them, and can't change them.
  const { data: m } = await setRole("user");
  await admin.from("staff_client_access").insert({ membership_id: m!.id, client_id: frank.clientId });
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("group", { name: "Internal Review" }).getByText("Legal check")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Status" })).toHaveCount(0);
  const u = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await u.auth.signInWithPassword({ email: frank.staffEmail, password: frank.staffPassword });
  expect((await u.from("project_statuses").update({ label: "By a User" }).eq("id", first.id).select("id")).data ?? []).toHaveLength(0);
});

test("a post takes its stage's first status, the team picks another on the post, the table shows it, and a client sees none", async ({ page, browser, frank }) => {
  test.setTimeout(120_000);
  const list = await statuses(frank.projectId);
  const qcCopy = list.find((s) => s.label === "Internal QC (Copy)")!;
  // Into Internal Review: the first status, set by the database.
  await admin.from("creatives").update({ stage: 3, scheduled_at: new Date().toISOString() }).eq("id", frank.creativeId);
  expect((await admin.from("creatives").select("status_id").eq("id", frank.creativeId).single()).data!.status_id).toBe(qcCopy.id);

  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  // The active Internal pill is the dropdown, lettered within its stage.
  const pick = page.locator(".stagesw").getByLabel("Status within the stage");
  await expect(pick).toHaveValue(qcCopy.id);
  // Only Internal Review's statuses are offered.
  // The stage alone first (phase124), then Internal Review's statuses only.
  await expect(pick.locator("option")).toHaveText(["3. Internal", "3a. Internal QC (Copy)", "3b. Internal QC (Creative)", "3c. Hold", "3d. Cancel"]);
  await pick.selectOption({ label: "3c. Hold" });
  const statusNow = async () => (await admin.from("creatives").select("status_id").eq("id", frank.creativeId).single()).data!.status_id;
  await expect.poll(statusNow).toBe(list.find((s) => s.label === "Hold")!.id);

  // The table's Status pill is the same dropdown, showing it, and picks too.
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  const tablePick = page.locator("tr[data-row] select.stg-pick").first();
  await expect(tablePick).toHaveValue(list.find((s) => s.label === "Hold")!.id, { timeout: 20_000 });
  await tablePick.selectOption({ label: "3b. Internal QC (Creative)" });
  await expect.poll(statusNow).toBe(list.find((s) => s.label === "Internal QC (Creative)")!.id);
  // The stage alone: no status, and it stays that way.
  await tablePick.selectOption({ label: "3. Internal Review" });
  await expect.poll(statusNow).toBeNull();
  await page.reload();
  await expect(page.locator("tr[data-row] select.stg-pick").first()).toHaveValue("", { timeout: 20_000 });

  // Leaving the stage clears it; no picker in Client Review.
  await admin.from("creatives").update({ stage: 4 }).eq("id", frank.creativeId);
  expect((await admin.from("creatives").select("status_id").eq("id", frank.creativeId).single()).data!.status_id).toBeNull();
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await expect(page.locator(".stage-h")).toBeVisible();
  await expect(page.getByLabel("Status within the stage")).toHaveCount(0);

  // A client: no picker, no status in the table, and none to read.
  await admin.from("creatives").update({ stage: 3 }).eq("id", frank.creativeId);
  const clientPage = await (await browser.newContext()).newPage();
  await frank.loginAsClient(clientPage);
  await clientPage.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await expect(clientPage.locator(".stagesw.ro")).toBeVisible();
  await expect(clientPage.getByLabel("Status within the stage")).toHaveCount(0);
  await clientPage.goto(`${APP_URL}/projects/${frank.projectId}`);
  await expect(clientPage.locator("tr[data-row]").first()).toBeVisible({ timeout: 20_000 });
  await expect(clientPage.locator(".stg-pick")).toHaveCount(0);
  await expect(clientPage.locator("tr[data-row] .stg").first()).toContainText("3.Internal Review");
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email: frank.clientEmail, password: frank.clientPassword });
  expect((await c.from("project_statuses").select("id").eq("project_id", frank.projectId)).data).toEqual([]);
});
