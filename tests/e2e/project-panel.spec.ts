import { createClient } from "@supabase/supabase-js";
import type { Browser } from "@playwright/test";
import { test, expect, APP_URL } from "./fixtures";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function signedIn(email: string, password: string) {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}

// A second team member, signed in in their own browser.
async function teammate(browser: Browser, agencyId: string) {
  const email = "e2e-member-" + Date.now() + "@example.invalid";
  const password = "E2e-Second-Test-1234!";
  const { data: u } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const id = u.user!.id;
  await admin.from("users").insert({ id, email, name: "Raj Second" });
  const { data: m } = await admin
    .from("memberships")
    .insert({ agency_id: agencyId, user_id: id, role: "admin", accepted_at: new Date().toISOString() })
    .select("id")
    .single();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(APP_URL + "/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard");
  return {
    id,
    email,
    password,
    page,
    async remove() {
      await ctx.close();
      await admin.from("project_discussion").delete().eq("author_id", id);
      await admin.from("memberships").delete().eq("id", m!.id);
      await admin.from("users").delete().eq("id", id);
      await admin.auth.admin.deleteUser(id);
    },
  };
}

// A project's "…" menu (phase84, direct instruction): its Activity Log
// (what, by whom, when: what was already recorded and the log from phase84
// on), its Discussion (the team's threads, @mentions in the bell) and its
// Settings. The team only.
test("the Activity Log shows what happened, by whom, from the record and the new log", async ({ page, frank }) => {
  test.setTimeout(90_000);
  // Done the way the app does them, as the signed-in team member.
  const staff = await signedIn(frank.staffEmail, frank.staffPassword);
  const edit = await staff.from("creatives").update({ concept: "A fresh concept" }).eq("id", frank.creativeId).select("id");
  expect(edit.data).toHaveLength(1);
  const rename = await staff.from("projects").update({ name: "Renamed Project" }).eq("id", frank.projectId).select("id");
  expect(rename.data).toHaveLength(1);
  await frank.insertCommentAsStaff("Can we try a warmer photo?", "private");

  await frank.loginAsStaff(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  await page.getByRole("button", { name: "Project options" }).click();
  for (const item of ["Activity Log", "Discussion", "Settings"]) {
    await expect(page.getByRole("button", { name: item, exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Activity Log", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "Activity log" });
  await expect(panel).toBeVisible();
  // The log from now on, by the signed-in person.
  await expect(panel.locator(".pj-act", { hasText: "edited" })).toContainText("E2E Staff edited E2E Test Creative: Concept");
  await expect(panel.locator(".pj-act", { hasText: "renamed" })).toContainText("E2E Staff renamed the project from “E2E Test Project” to “Renamed Project”");
  // And what was already recorded.
  await expect(panel.locator(".pj-act", { hasText: "internal comment" })).toContainText("E2E Staff left an internal comment on E2E Test Creative: “Can we try a warmer photo?”");
  await expect(panel.locator(".pj-act", { hasText: "added" }).first()).toContainText("E2E Test Creative");
  await expect(panel.locator(".pj-day").first()).toHaveText("Today");
  await expect(panel.locator(".pj-title")).toHaveText("Renamed Project Activity Log");
  // The post links to it.
  await expect(panel.locator(".pj-act", { hasText: "edited" }).getByRole("link", { name: "E2E Test Creative" })).toHaveAttribute(
    "href",
    `/creatives/${frank.creativeId}`,
  );
  await panel.getByRole("button", { name: "Close" }).click();
  await expect(panel).toHaveCount(0);

  // Settings opens the project's settings.
  await page.getByRole("button", { name: "Project options" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Renamed Project" })).toBeVisible();
});

test("Discussion: a thread with a mention reaches the bell, replies arrive live, you edit and delete your own", async ({
  page,
  browser,
  frank,
}) => {
  test.setTimeout(150_000);
  const other = await teammate(browser, frank.agencyId);
  try {
    await frank.loginAsStaff(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${APP_URL}/projects/${frank.projectId}`);
    await page.getByRole("button", { name: "Project options" }).click();
    await page.getByRole("button", { name: "Discussion", exact: true }).click();
    const panel = page.getByRole("complementary", { name: "Discussion" });
    await expect(panel.getByText("No discussion yet.")).toBeVisible();

    // @ offers the project's team.
    const box = panel.getByLabel("New message");
    await box.pressSequentially("Shoot moved to Friday, @Raj");
    await panel.getByRole("option", { name: "@Raj Second" }).click();
    await box.pressSequentially("can you confirm?");
    await panel.getByRole("button", { name: "Post" }).click();
    const thread = panel.locator(".pj-thread").first();
    await expect(thread.locator(".pj-text")).toHaveText("Shoot moved to Friday, @Raj Second can you confirm?");
    await expect(thread.locator(".pj-mention")).toHaveText("@Raj Second");

    // Raj's bell has it, and it opens the Discussion.
    const b = other.page;
    await expect
      .poll(async () => (await admin.from("notifications").select("kind").eq("user_id", other.id)).data?.map((n) => n.kind), {
        timeout: 15_000,
      })
      .toEqual(["discussion_mention"]);
    await b.goto(APP_URL + "/dashboard");
    await b.getByRole("button", { name: /Notifications/ }).click();
    await b.locator(".nrow", { hasText: "mentioned you in" }).click();
    await b.waitForURL(`**/projects/${frank.projectId}?panel=discussion`);
    const bPanel = b.getByRole("complementary", { name: "Discussion" });
    await expect(bPanel.locator(".pj-text").first()).toContainText("Shoot moved to Friday");

    // Raj replies; it shows on the first page without a reload.
    await bPanel.getByLabel("Reply").fill("Confirmed, Friday works.");
    await bPanel.getByRole("button", { name: "Reply" }).click();
    await expect(thread.locator(".pj-reply .pj-text")).toHaveText("Confirmed, Friday works.", { timeout: 15_000 });
    // Raj gets no Edit on someone else's message, and the database refuses.
    await expect(bPanel.locator(".pj-thread").first().locator(".pj-msg").first().getByRole("button", { name: "Edit" })).toHaveCount(0);
    const rajDb = await signedIn(other.email, other.password);
    const firstId = (await admin.from("project_discussion").select("id").is("parent_id", null).eq("project_id", frank.projectId).single()).data!.id;
    const sneaky = await rajDb.from("project_discussion").update({ body: "Changed" }).eq("id", firstId).select("id");
    expect(sneaky.data ?? []).toHaveLength(0);

    // Editing and deleting your own.
    const mine = thread.locator(".pj-msg").first();
    await mine.getByRole("button", { name: "Edit" }).click();
    await mine.getByLabel("Edit message").fill("Shoot moved to Saturday.");
    await mine.getByRole("button", { name: "Save" }).click();
    await expect(mine.locator(".pj-text")).toHaveText("Shoot moved to Saturday.");
    await expect(mine).toContainText("Edited");
    await mine.getByRole("button", { name: "Delete" }).click();
    await mine.getByRole("button", { name: "Delete" }).click();
    await expect(mine.locator(".pj-deleted")).toHaveText("This message was deleted.");
    // The reply keeps its place.
    await expect(thread.locator(".pj-reply .pj-text")).toHaveText("Confirmed, Friday works.");
  } finally {
    await other.remove();
  }
});

test("a client's people get no menu, and can't read the log or the discussion", async ({ page, frank }) => {
  test.setTimeout(60_000);
  const staff = await signedIn(frank.staffEmail, frank.staffPassword);
  await staff.from("project_discussion").insert({ project_id: frank.projectId, body: "Team only" });
  await staff.from("projects").update({ description: "Changed" }).eq("id", frank.projectId);
  const client = await signedIn(frank.clientEmail, frank.clientPassword);
  expect((await client.from("project_discussion").select("id")).data ?? []).toHaveLength(0);
  expect((await client.from("project_activity").select("id")).data ?? []).toHaveLength(0);
  const feed = await client.rpc("project_activity_feed", { p_project_id: frank.projectId });
  expect(((feed.data ?? []) as { kind: string }[]).filter((r) => r.kind.startsWith("project_"))).toHaveLength(0);
  expect((await client.rpc("project_team_members", { p_project_id: frank.projectId })).data ?? []).toHaveLength(0);
  // Nor a message of their own.
  const post = await client.from("project_discussion").insert({ project_id: frank.projectId, body: "Hello" }).select("id");
  expect(post.error).not.toBeNull();

  await frank.loginAsClient(page);
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  await expect(page.locator(".h1")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Project options" })).toHaveCount(0);
});

// A person's role on the project (phase85, direct instruction): set in
// Project Settings → Roles, shown in brackets after their name in the
// Team column (the Lead column, renamed), nothing when blank. Owners and
// Admins set them; a Client can't.
test("a role set in Project Settings shows after the name in the Team column", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  // This month, so the table shows it, led by the team member.
  await admin.from("creatives").update({ lead_user_id: staffId, scheduled_at: new Date().toISOString() }).eq("id", frank.creativeId);
  await frank.loginAsStaff(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  const cell = page.locator("tr[data-row] .lead").first();
  await expect(cell).toHaveText("EE2E Staff", { timeout: 20_000 });
  await expect(page.locator("th", { hasText: "Team" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Project options" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const role = page.getByLabel("E2E Staff's role");
  await role.fill("Designer");
  await role.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(cell.locator(".lead-role")).toHaveText("(Designer)");
  expect((await admin.from("project_roles").select("role").eq("project_id", frank.projectId)).data).toEqual([{ role: "Designer" }]);

  // Cleared: nothing shows.
  await page.getByRole("button", { name: "Project options" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("E2E Staff's role").fill("");
  await page.getByLabel("E2E Staff's role").press("Enter");
  await page.keyboard.press("Escape");
  await expect(cell.locator(".lead-role")).toHaveCount(0);
  expect((await admin.from("project_roles").select("role").eq("project_id", frank.projectId)).data).toEqual([]);

  // A Client can't set one.
  const client = await signedIn(frank.clientEmail, frank.clientPassword);
  const attempt = await client.from("project_roles").insert({ project_id: frank.projectId, user_id: staffId, role: "Boss" }).select("role");
  expect(attempt.error).not.toBeNull();
});
