import { createClient } from "@supabase/supabase-js";
import { test, expect, goToMonth } from "./fixtures";

// Approving a concept (phase115, direct instruction): the client or anyone
// on the team, from the post's comments or the table's Concept & Reference
// cell. It moves the post to In Production and records the approval as a
// comment in the approver's name.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const conceptPost = async (frank: { createCreativeAtStage: (stage: number, name?: string) => Promise<string> }, name: string) => {
  const id = await frank.createCreativeAtStage(1, name);
  await admin.from("creatives").update({ concept: "Rain on the window, a warm cup." }).eq("id", id);
  return id;
};

test("the team approves a concept from the post's comments", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const id = await conceptPost(frank, "Team Approves Concept");
  // A written Concept no longer moves it on by itself.
  expect((await admin.from("creatives").select("stage").eq("id", id).single()).data!.stage).toBe(1);

  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${id}`);
  // Nothing to look at but the brief yet: it opens there.
  await expect(page.getByRole("button", { name: "Brief" }).first()).toHaveAttribute("aria-current", "true", { timeout: 15_000 });
  await page.getByRole("button", { name: "Approve Concept" }).click();
  await expect(page.locator(".cmt", { hasText: "Approved Concept" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Approve Concept" })).toHaveCount(0);
  const { data: c } = await admin.from("creatives").select("stage").eq("id", id).single();
  expect(c!.stage).toBe(2);
  const { data: cm } = await admin.from("comments").select("body, visibility").eq("creative_id", id);
  expect(cm).toEqual([{ body: "Approved Concept", visibility: "public" }]);

  // The team's approval stays on the post's page: Client Feedback is the client's.
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  const row = page.locator("tr[data-row]", { hasText: "Team Approves Concept" });
  // The team's pill shows its status within the stage (phase123): the first.
  await expect(row.locator(".stg")).toContainText("2a. In Progress (Content)", { timeout: 15_000 });
  await expect(row.locator(".feedback-note")).toHaveCount(0);
});

test("a client approves a concept from the table, and it shows as their feedback", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const id = await conceptPost(frank, "Client Approves Concept");
  await frank.loginAsClient(page);

  // On the post's page, in Concept, the client has the comments and Approve.
  await page.goto(`/creatives/${id}`);
  await expect(page.getByRole("button", { name: "Approve Concept" })).toBeVisible({ timeout: 15_000 });

  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  const row = page.locator("tr[data-row]", { hasText: "Client Approves Concept" });
  await row.getByRole("button", { name: "Approve Concept" }).click();
  await expect(row.getByRole("button", { name: "Approve Concept" })).toHaveCount(0, { timeout: 15_000 });
  const { data: client } = await admin.from("users").select("id, name").eq("email", frank.clientEmail).single();
  // Client Feedback: their name, small, over what they said.
  const note = row.locator(".feedback-note");
  await expect(note).toContainText("Approved Concept");
  await expect(note).not.toContainText("Client Approved Concept");
  // Their name, then when (direct instruction).
  await expect(note.locator(".cc-v")).toContainText(client!.name);
  await expect(note.locator(".cc-v")).toHaveText(new RegExp(`^${client!.name} · \\d{1,2} \\w{3}, \\d{2}:\\d{2}$`));
  await expect(row.locator(".stg")).toContainText("In Production");

  const { data: cm } = await admin.from("comments").select("body, author_id").eq("creative_id", id);
  expect(cm).toEqual([{ body: "Client Approved Concept", author_id: client!.id }]);
});

test("a deleted client comment leaves the table's Client Feedback, without a reload", async ({ page, frank }) => {
  test.setTimeout(120_000);
  const id = await conceptPost(frank, "Feedback Then Deleted");
  // The client's comment, from their own session (its author depends on who's calling).
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email: frank.clientEmail, password: frank.clientPassword });
  const { data: me } = await client.auth.getUser();
  const { data: cm, error } = await client
    .from("comments")
    .insert({ agency_id: frank.agencyId, creative_id: id, author_id: me.user!.id, body: "This is not good", visibility: "public" })
    .select("id")
    .single();
  expect(error).toBeNull();
  // Owners delete comments (phase97).
  const { data: staff } = await admin.from("users").select("id").eq("email", frank.staffEmail).single();
  await admin.from("memberships").update({ role: "owner" }).eq("user_id", staff!.id).eq("agency_id", frank.agencyId);

  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty", { timeout: 60_000 });
  await goToMonth(page, "March 2027");
  const row = page.locator("tr[data-row]", { hasText: "Feedback Then Deleted" });
  await expect(row.locator(".feedback-note")).toContainText("This is not good", { timeout: 15_000 });

  // Deleted on the post's page, then back to the table in the same visit.
  await row.locator(".pname").first().click();
  await page.waitForURL(/\/creatives\//, { timeout: 15_000 });
  const card = page.locator(`#cmt-${cm!.id}`);
  await card.getByRole("button", { name: "Delete comment" }).click({ timeout: 15_000 });
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(card).toHaveCount(0, { timeout: 15_000 });
  await page.goBack();
  await page.waitForSelector(".tblwrap, .empty", { timeout: 60_000 });
  await goToMonth(page, "March 2027");
  await expect(page.locator("tr[data-row]", { hasText: "Feedback Then Deleted" })).toBeVisible();
  await expect(page.locator("tr[data-row]", { hasText: "Feedback Then Deleted" }).locator(".feedback-note")).toHaveCount(0, { timeout: 15_000 });
});

test("Internal Feedback shows the team's latest open comment, private ones included, for the team only", async ({ page, browser, frank }) => {
  test.setTimeout(120_000);
  const id = await conceptPost(frank, "Two Kinds Of Feedback");
  const signIn = async (email: string, password: string) => {
    const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email, password });
    return c;
  };
  // Each from their own session (visibility and author depend on who's calling).
  const staff = await signIn(frank.staffEmail, frank.staffPassword);
  const client = await signIn(frank.clientEmail, frank.clientPassword);
  const me = (await staff.auth.getUser()).data.user!.id;
  const them = (await client.auth.getUser()).data.user!.id;
  expect((await staff.from("comments").insert({ agency_id: frank.agencyId, creative_id: id, author_id: me, body: "An earlier note", visibility: "private" })).error).toBeNull();
  expect((await staff.from("comments").insert({ agency_id: frank.agencyId, creative_id: id, author_id: me, body: "Tighten the hook", visibility: "private" })).error).toBeNull();
  expect((await client.from("comments").insert({ agency_id: frank.agencyId, creative_id: id, author_id: them, body: "Love the colours", visibility: "public" })).error).toBeNull();
  const staffName = (await admin.from("users").select("name").eq("id", me).single()).data!.name;

  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty", { timeout: 60_000 });
  await goToMonth(page, "March 2027");
  await expect(page.locator("th", { hasText: /^Internal Feedback/ })).toHaveCount(1);
  const row = page.locator("tr[data-row]", { hasText: "Two Kinds Of Feedback" });
  const internal = row.locator("td").filter({ hasText: "Tighten the hook" });
  await expect(internal).toHaveCount(1, { timeout: 15_000 });
  await expect(internal.locator(".cc-v")).toContainText(staffName);
  await expect(internal).not.toContainText("Love the colours");
  // Show All: every team comment, newest first, with who and when.
  await internal.getByText("Show All (2)").hover();
  const pop = page.locator(".copypop");
  await expect(pop.locator(".cp-row")).toHaveCount(2, { timeout: 5_000 });
  await expect(pop.locator(".cp-row").first()).toContainText("Tighten the hook");
  await expect(pop.locator(".cp-row").nth(1)).toContainText("An earlier note");
  await expect(pop.locator(".cp-row").first().locator("b")).toContainText(staffName);
  await expect(row.locator(".feedback-note")).toContainText("Love the colours");

  // A client has no Internal Feedback column.
  const ctx = await browser.newContext();
  const cp = await ctx.newPage();
  await frank.loginAsClient(cp);
  await cp.goto(`/projects/${frank.projectId}`);
  await cp.waitForSelector(".tblwrap, .empty", { timeout: 60_000 });
  await goToMonth(cp, "March 2027");
  await cp.waitForSelector(".tbl th", { timeout: 30_000 });
  await expect(cp.locator("th", { hasText: /^Client Feedback/ })).toHaveCount(1);
  await expect(cp.locator("th", { hasText: /^Internal Feedback/ })).toHaveCount(0);
  await ctx.close();
});
