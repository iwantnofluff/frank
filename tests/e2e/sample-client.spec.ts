import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";
import { seedSampleClient } from "../../lib/sample/seed";

// The sample client (phase145, direct instruction): Lumen Skin, made in
// every new workspace, marked Sample, not counted towards the client limit,
// its 7 days started on the first visit, removable by Owners and Admins, and
// never a way to invite anyone real.
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function seed(agencyId: string, staffEmail: string) {
  const staffId = (await admin.from("users").select("id").eq("email", staffEmail).single()).data!.id as string;
  const clientId = await seedSampleClient(admin, agencyId, staffId);
  expect(clientId).toBeTruthy();
  return clientId!;
}

test("the sample client doesn't take a place under the client limit", async ({ page, frank }) => {
  test.setTimeout(120_000);
  // A limit of 3, with 2 of the agency's own clients.
  // Starter's 3, without the fixture's extra 47.
  await admin.from("agencies").update({ extra_clients: 0 }).eq("id", frank.agencyId);
  expect((await admin.from("agencies").select("client_limit").eq("id", frank.agencyId).single()).data!.client_limit).toBe(3);
  await admin.from("clients").insert({ agency_id: frank.agencyId, name: "E2E Second Client" });
  // Made over a full limit too: it never counts.
  await admin.from("clients").insert({ agency_id: frank.agencyId, name: "E2E Third Client" });
  await seed(frank.agencyId, frank.staffEmail);
  await admin.from("clients").delete().eq("agency_id", frank.agencyId).eq("name", "E2E Third Client");

  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/dashboard`);
  await expect(page.locator(".crow", { hasText: "Lumen Skin" }).locator(".sample-tag")).toHaveText("Sample");
  await page.getByRole("button", { name: "New Client" }).click();
  // 2 of 3 used: the sample isn't one of them.
  await expect(page.getByText("2 of 3 clients used")).toBeVisible();
  // The last place is still free for one of the agency's own.
  const { error } = await admin.from("clients").insert({ agency_id: frank.agencyId, name: "E2E Third Client" });
  expect(error).toBeNull();
});

test("its 7 days start on the first visit, its pages say so, and Hide Now hides it without deleting anything", async ({ page, frank }) => {
  test.setTimeout(120_000);
  const clientId = await seed(frank.agencyId, frank.staffEmail);
  expect((await admin.from("clients").select("sample_expires_at").eq("id", clientId).single()).data!.sample_expires_at).toBeNull();

  await frank.loginAsStaff(page);
  // The first visit starts the 7 days.
  await expect
    .poll(async () => (await admin.from("clients").select("sample_expires_at").eq("id", clientId).single()).data!.sample_expires_at, { timeout: 15_000 })
    .not.toBeNull();
  const expires = Date.parse((await admin.from("clients").select("sample_expires_at").eq("id", clientId).single()).data!.sample_expires_at!);
  expect(Math.abs(expires - (Date.now() + 7 * 86_400_000))).toBeLessThan(10 * 60_000);

  await page.goto(`${APP_URL}/clients/${clientId}`);
  const banner = page.locator(".samplebar");
  await expect(banner).toContainText("Lumen Skin is a made-up client to explore Frank with. It’s hidden from your lists in 7 days");
  await expect(page.locator(".h1 .sample-tag")).toHaveText("Sample");
  const projectId = (await admin.from("projects").select("id").eq("client_id", clientId).eq("delivery", "scheduled").single()).data!.id;
  await page.goto(`${APP_URL}/projects/${projectId}`);
  await expect(banner).toBeVisible();

  // Hidden (phase146): out of the lists, Archived included, but all there.
  await banner.getByRole("button", { name: "Hide Now" }).click();
  await expect(banner).toContainText("hidden from your lists. It’s shown here for Frank Tour");
  await page.goto(`${APP_URL}/dashboard`);
  await expect(page.locator(".crow", { hasText: "E2E Test Client" })).toBeVisible();
  await expect(page.locator(".crow", { hasText: "Lumen Skin" })).toHaveCount(0);
  await page.getByRole("button", { name: /^Archived/ }).click();
  await expect(page.locator(".crow", { hasText: "Lumen Skin" })).toHaveCount(0);
  expect((await admin.from("projects").select("id").eq("id", projectId)).data).toHaveLength(1);
  const { data: files } = await admin.storage.from("assets").list(`${frank.agencyId}/sample`, { limit: 100 });
  expect(files!.length).toBe(3);
  // Nobody signed in can delete it, either way.
  const session = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await session.auth.signInWithPassword({ email: frank.staffEmail, password: frank.staffPassword });
  const { error } = await session.rpc("delete_client_permanently", { p_client_id: clientId });
  expect(error).not.toBeNull();
  const { error: sampleDelete } = await session.rpc("delete_sample_client", { p_client_id: clientId });
  expect(sampleDelete).not.toBeNull();
  expect((await admin.from("clients").select("id").eq("id", clientId)).data).toHaveLength(1);
});

test("nobody can be invited to the sample client", async ({ page, frank }) => {
  test.setTimeout(120_000);
  const clientId = await seed(frank.agencyId, frank.staffEmail);
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  await admin.from("memberships").update({ can_invite: true }).eq("user_id", staffId).eq("agency_id", frank.agencyId);
  await frank.loginAsStaff(page);
  const res = await page.request.post(`${APP_URL}/api/team/invite`, {
    data: { agencyId: frank.agencyId, email: "someone@example.invalid", firstName: "Some", lastName: "One", role: "client", clientIds: [clientId] },
  });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toContain("The sample client is made up");
  expect((await admin.from("memberships").select("id").eq("client_id", clientId)).data).toEqual([]);
});

test("every User on the team is given the sample, sees its banner, and can't hide it", async ({ page, frank }) => {
  test.setTimeout(120_000);
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  // A User already on the team when it's made.
  const { data: mem } = await admin.from("memberships").update({ role: "user" }).eq("user_id", staffId).eq("agency_id", frank.agencyId).select("id").single();
  const clientId = await seed(frank.agencyId, frank.staffEmail);
  expect((await admin.from("staff_client_access").select("id").eq("membership_id", mem!.id).eq("client_id", clientId)).data).toHaveLength(1);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/clients/${clientId}`);
  await expect(page.locator(".samplebar")).toBeVisible();
  await expect(page.locator(".samplebar").getByRole("button")).toHaveCount(0);
});

test("Preferences adds the sample to a workspace without one, keeps it, or hides it after 7 days", async ({ page, frank }) => {
  test.setTimeout(150_000);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/settings/general/preferences`);
  const add = page.getByRole("button", { name: "Add the Sample Client" });
  await add.click();
  const choice = page.getByLabel("Sample client", { exact: true });
  await expect(choice).toHaveValue("remove", { timeout: 60_000 });
  const sample = (await admin.from("clients").select("id, sample_expires_at").eq("agency_id", frank.agencyId).eq("is_sample", true).single()).data!;
  expect(Math.abs(Date.parse(sample.sample_expires_at!) - (Date.now() + 7 * 86_400_000))).toBeLessThan(10 * 60_000);
  await expect(page.locator(".samplebar")).toContainText("hidden from your lists in 7 days");

  // Kept: a date that never comes, so the clean-up never takes it.
  await choice.selectOption("keep");
  await expect(page.locator(".samplebar")).toContainText("kept in your lists,");
  await expect
    .poll(async () => (await admin.from("clients").select("sample_expires_at").eq("id", sample.id).single()).data!.sample_expires_at)
    .toBe("infinity");
  const { data: expired } = await admin.from("clients").select("id").eq("id", sample.id).lt("sample_expires_at", new Date().toISOString());
  expect(expired).toEqual([]);
  await page.reload();
  await expect(page.getByLabel("Sample client", { exact: true })).toHaveValue("keep");

  // Back to 7 days, from now.
  await page.getByLabel("Sample client", { exact: true }).selectOption("remove");
  await expect(page.locator(".samplebar")).toContainText("hidden from your lists in 7 days");
  // One at a time.
  await expect(add).toHaveCount(0);
  const again = await page.request.post(`${APP_URL}/api/sample/add`, { data: { agencyId: frank.agencyId } });
  expect(again.status()).toBe(409);
});

test("Reset puts the sample back as it was, and getting the tour ready resets it if something's missing", async ({ page, frank }) => {
  test.setTimeout(180_000);
  const clientId = await seed(frank.agencyId, frank.staffEmail);
  // Hidden, and its comments gone: the tour's comment step has nothing.
  await admin.from("clients").update({ archived_at: new Date().toISOString(), sample_expires_at: "infinity" }).eq("id", clientId);
  const projectId = (await admin.from("projects").select("id").eq("client_id", clientId).eq("delivery", "scheduled").single()).data!.id;
  const { data: posts } = await admin.from("creatives").select("id").eq("project_id", projectId);
  await admin.from("comments").delete().in("creative_id", posts!.map((p) => p.id));

  await frank.loginAsStaff(page);
  const ready = await page.request.post(`${APP_URL}/api/sample/ensure`, { data: { agencyId: frank.agencyId } });
  expect(ready.status()).toBe(200);
  const targets = await ready.json();
  // Made again, still hidden, with Maya's comments back.
  const { data: now } = await admin.from("clients").select("id, archived_at").eq("agency_id", frank.agencyId).eq("is_sample", true);
  expect(now).toHaveLength(1);
  expect(now![0].id).toBe(targets.clientId);
  expect(now![0].archived_at).not.toBeNull();
  expect((await admin.from("comments").select("id").eq("creative_id", targets.posts.comments)).data!.length).toBe(2);

  // Reset from Preferences: shown or hidden as it was.
  await page.goto(`${APP_URL}/settings/general/preferences`);
  await expect(page.getByText("Hidden from your lists. Frank Tour and Show Me still use it.")).toBeVisible();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByText("Reset.")).toBeVisible({ timeout: 60_000 });
  const { data: after } = await admin.from("clients").select("id, archived_at").eq("agency_id", frank.agencyId).eq("is_sample", true);
  expect(after).toHaveLength(1);
  expect(after![0].id).not.toBe(targets.clientId);
  expect(after![0].archived_at).not.toBeNull();
  // Shown again, kept.
  await page.getByRole("button", { name: "Show It" }).click();
  await expect(page.getByLabel("Sample client", { exact: true })).toHaveValue("keep");
});
