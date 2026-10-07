import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL, type Frank } from "./fixtures";

// Per-project access (phase46): Users and Clients are on chosen projects of
// their clients; Owners and Admins see every project.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const userIdOf = async (email: string) => (await admin.from("users").select("id").eq("email", email).single()).data!.id as string;

async function setStaffRole(frank: Frank, role: string) {
  await admin.from("memberships").update({ role }).eq("agency_id", frank.agencyId).eq("user_id", await userIdOf(frank.staffEmail));
}

async function projectsOf(frank: Frank, email: string) {
  const { data: m } = await admin
    .from("memberships")
    .select("id")
    .eq("agency_id", frank.agencyId)
    .eq("user_id", await userIdOf(email))
    .single();
  const { data } = await admin.from("project_access").select("project_id").eq("membership_id", m!.id);
  return (data ?? []).map((r) => r.project_id as string).sort();
}

test("inviting from a client's People puts a User on just the projects chosen", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const second = await frank.createContinuousProject();
  await setStaffRole(frank, "owner");
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/clients/${frank.clientId}/settings/people`);
  await page.locator(".setmain").getByRole("button", { name: "+ Invite People" }).click();
  const modal = page.getByRole("dialog", { name: "Invite Team Member" });

  const email = `e2e-proj-user-${Date.now()}@example.invalid`;
  await modal.getByLabel("First Name").fill("Pia");
  await modal.getByLabel("Last Name").fill("Project");
  await modal.getByLabel("Email Address").fill(email);
  // A User, with this client ticked already.
  await expect(modal.getByRole("checkbox", { name: "E2E Test Client" })).toHaveAttribute("aria-checked", "true");
  await modal.getByRole("button", { name: "Projects: All projects" }).click();
  const picker = page.getByRole("dialog", { name: "Projects" });
  await picker.getByRole("checkbox", { name: "All projects" }).click();
  await picker.getByRole("checkbox", { name: /E2E Continuous Project/ }).click();
  await expect(modal.getByRole("button", { name: /^Projects: E2E Continuous Project/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).toBeVisible();

  await modal.getByRole("button", { name: "Send Invite" }).click();
  await expect(page.getByRole("dialog", { name: "Invite Sent" })).toBeVisible({ timeout: 20_000 });
  expect(await projectsOf(frank, email)).toEqual([second]);
});

test("inviting a Client from Team puts them on the projects chosen", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await frank.createContinuousProject();
  await setStaffRole(frank, "owner");
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/settings/team`);
  await page.getByRole("button", { name: "Invite Member" }).click();
  const modal = page.getByRole("dialog", { name: "Invite Team Member" });
  const email = `e2e-proj-client-${Date.now()}@example.invalid`;
  await modal.getByLabel("First Name").fill("Cal");
  await modal.getByLabel("Last Name").fill("Client");
  await modal.getByLabel("Email Address").fill(email);
  await modal.getByLabel("Role").selectOption("client");
  await modal.getByLabel("Their Client").selectOption({ label: "E2E Test Client" });
  await modal.getByRole("button", { name: "Projects: All projects" }).click();
  const picker = page.getByRole("dialog", { name: "Projects" });
  await picker.getByRole("checkbox", { name: /E2E Continuous Project/ }).click();
  // Unticking one of two leaves the other.
  await expect(modal.getByRole("button", { name: /^Projects: (?!All)/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await modal.getByRole("button", { name: "Send Invite" }).click();
  await expect(page.getByRole("dialog", { name: "Invite Sent" })).toBeVisible({ timeout: 20_000 });
  expect(await projectsOf(frank, email)).toEqual([frank.projectId]);
});

// An accepted User given the fixture client, with a password to sign in as.
async function seedUser(frank: Frank) {
  const email = `e2e-onproj-${Date.now()}@example.invalid`;
  const password = "E2e-OnProj-1234!";
  const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  await admin.from("users").insert({ id: data.user!.id, email, name: "Proj User" });
  const { data: m } = await admin
    .from("memberships")
    .insert({ agency_id: frank.agencyId, user_id: data.user!.id, role: "user", accepted_at: new Date().toISOString() })
    .select("id")
    .single();
  await admin.from("staff_client_access").insert({ membership_id: m!.id, client_id: frank.clientId });
  return { email, password };
}

test("an Owner takes a User off a project from its profile, and the User no longer sees it", async ({
  page,
  browser,
  frank,
}) => {
  test.setTimeout(120_000);
  const second = await frank.createContinuousProject();
  const user = await seedUser(frank);
  // On both, from the client grant.
  expect(await projectsOf(frank, user.email)).toEqual([frank.projectId, second].sort());

  await setStaffRole(frank, "owner");
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/clients/${frank.clientId}`);
  await page.getByRole("button", { name: "Open E2E Test Project's profile" }).click();
  const modal = page.getByRole("dialog", { name: "E2E Test Project" });
  await expect(modal.locator(".profperson", { hasText: "Proj User" })).toBeVisible();
  await page.screenshot({ path: `${process.env.SHOT_DIR ?? "test-results"}/project-profile.png` });
  await modal.getByRole("button", { name: "Take Proj User off this project" }).click();
  await expect(modal.locator(".profperson", { hasText: "Proj User" })).toHaveCount(0);
  await expect(modal.getByLabel("Add someone to this project").locator("option")).toHaveText([
    "+ Add someone from E2E Test Client",
    "Proj User (User)",
  ]);
  expect(await projectsOf(frank, user.email)).toEqual([second]);

  // The User, signed in: only the project they're still on.
  const ctx = await browser.newContext();
  try {
    const up = await ctx.newPage();
    await up.goto(`${APP_URL}/login`);
    await up.fill('input[type="email"]', user.email);
    await up.fill('input[type="password"]', user.password);
    await up.click('button[type="submit"]');
    await up.waitForURL(`${APP_URL}/dashboard`, { timeout: 20_000 });
    await up.goto(`${APP_URL}/clients/${frank.clientId}`);
    await expect(up.locator(".crow", { hasText: "E2E Continuous Project" })).toBeVisible();
    await expect(up.locator(".crow", { hasText: "E2E Test Project" })).toHaveCount(0);
    // A User sees a profile read-only (phase47): no fields, no Save, no people.
    await up.getByRole("button", { name: /^Open E2E Continuous Project/ }).click();
    const theirs = up.getByRole("dialog", { name: /E2E Continuous Project/ });
    await expect(theirs).toContainText("Owners and Admins change these.");
    await expect(theirs.locator(".profdl")).toContainText("Other Content");
    await up.screenshot({ path: `${process.env.SHOT_DIR ?? "test-results"}/project-profile-user.png`, animations: "disabled" });
    await expect(theirs.getByRole("textbox")).toHaveCount(0);
    await expect(theirs.getByRole("button", { name: "Save" })).toHaveCount(0);
    await expect(theirs).toContainText("Owners and Admins choose who's on this project.");
    await expect(theirs.locator(".profperson")).toHaveCount(0);
  } finally {
    await ctx.close();
  }

  // Nor straight at the database; archiving, not a detail, still works.
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  await c.auth.signInWithPassword({ email: user.email, password: user.password });
  const renamed = await c.from("projects").update({ name: "Renamed By User" }).eq("id", second).select("id");
  expect(renamed.error?.code).toBe("42501");
  const archived = await c.from("projects").update({ archived_at: new Date().toISOString() }).eq("id", second).select("id");
  expect(archived.data).toHaveLength(1);
  await admin.from("projects").update({ archived_at: null }).eq("id", second);

  // Back on.
  await modal.getByLabel("Add someone to this project").selectOption({ label: "Proj User (User)" });
  await expect(modal.locator(".profperson", { hasText: "Proj User" })).toBeVisible();
  expect(await projectsOf(frank, user.email)).toEqual([frank.projectId, second].sort());
});

test("a client's profile lists its people with their projects, and an Owner changes them there", async ({
  page,
  frank,
}) => {
  test.setTimeout(90_000);
  const second = await frank.createContinuousProject();
  const user = await seedUser(frank);
  await setStaffRole(frank, "owner");
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/clients/${frank.clientId}/settings/people`);
  const modal = page.locator(".setmain");
  const person = modal.locator(".profperson", { hasText: "Proj User" });
  // Their projects in words under their name, changed from Edit Projects.
  await expect(person.locator(".pp-projs")).toContainText("All projects");
  await page.screenshot({ path: `${process.env.SHOT_DIR ?? "test-results"}/client-profile.png` });

  await person.getByRole("button", { name: "Edit Projects" }).click();
  const projects = page.getByRole("dialog", { name: "Proj User's Projects" });
  await expect(projects.getByRole("button", { name: "Save" })).toBeDisabled();
  await projects.getByRole("checkbox", { name: "E2E Test Project" }).click();
  await projects.getByRole("button", { name: "Save" }).click();
  await expect(projects.getByText("Saved")).toBeVisible();
  await expect(projects.getByRole("button", { name: "Save" })).toBeDisabled();
  await projects.getByRole("button", { name: "Done" }).click();
  await expect(person.locator(".pp-projs")).toContainText(/^E2E Continuous Project/);
  await expect.poll(() => projectsOf(frank, user.email)).toEqual([second]);

  // Invite People starts with this client chosen.
  await modal.getByRole("button", { name: "+ Invite People" }).click();
  const invite = page.getByRole("dialog", { name: "Invite Team Member" });
  await invite.getByLabel("Role").selectOption("client");
  await expect(invite.getByLabel("Their Client")).toHaveValue(frank.clientId);
});

test("a User sees a client's details read-only; nobody changes a project's delivery", async ({ browser, frank }) => {
  test.setTimeout(90_000);
  const user = await seedUser(frank);
  const ctx = await browser.newContext();
  try {
    const up = await ctx.newPage();
    await up.goto(`${APP_URL}/login`);
    await up.fill('input[type="email"]', user.email);
    await up.fill('input[type="password"]', user.password);
    await up.click('button[type="submit"]');
    await up.waitForURL(`${APP_URL}/dashboard`, { timeout: 20_000 });
    await up.goto(`${APP_URL}/clients/${frank.clientId}/settings/details`);
    const profile = up.locator(".setmain");
    await expect(profile.locator(".profclient")).toBeVisible();
    await expect(profile.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  } finally {
    await ctx.close();
  }

  // The database agrees (phase48): a User can't rename the client…
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  await c.auth.signInWithPassword({ email: user.email, password: user.password });
  const renamed = await c.from("clients").update({ name: "Renamed By User" }).eq("id", frank.clientId).select("id");
  expect(renamed.error?.code).toBe("42501");

  // …and an Admin can't switch a project's delivery, posts or not.
  const empty = await frank.createContinuousProject();
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  await s.auth.signInWithPassword({ email: frank.staffEmail, password: frank.staffPassword });
  const delivery = await s.from("projects").update({ delivery: "scheduled" }).eq("id", empty).select("id");
  expect(delivery.error?.code).toBe("42501");
});
