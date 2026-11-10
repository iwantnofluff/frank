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

test("its 7 days start on the first visit, its pages say so, and Remove Now takes it and its files", async ({ page, frank }) => {
  test.setTimeout(120_000);
  const clientId = await seed(frank.agencyId, frank.staffEmail);
  expect((await admin.from("clients").select("sample_expires_at").eq("id", clientId).single()).data!.sample_expires_at).toBeNull();
  const { data: files } = await admin.storage.from("assets").list(`${frank.agencyId}/sample`, { limit: 100 });
  expect(files!.length).toBe(3);

  await frank.loginAsStaff(page);
  // The first visit starts the 7 days.
  await expect
    .poll(async () => (await admin.from("clients").select("sample_expires_at").eq("id", clientId).single()).data!.sample_expires_at, { timeout: 15_000 })
    .not.toBeNull();
  const expires = Date.parse((await admin.from("clients").select("sample_expires_at").eq("id", clientId).single()).data!.sample_expires_at!);
  expect(Math.abs(expires - (Date.now() + 7 * 86_400_000))).toBeLessThan(10 * 60_000);

  await page.goto(`${APP_URL}/clients/${clientId}`);
  const banner = page.locator(".samplebar");
  await expect(banner).toContainText("Lumen Skin is a made-up client to explore Frank with. It’s removed in 7 days");
  await expect(page.locator(".h1 .sample-tag")).toHaveText("Sample");
  const projectId = (await admin.from("projects").select("id").eq("client_id", clientId).single()).data!.id;
  await page.goto(`${APP_URL}/projects/${projectId}`);
  await expect(banner).toBeVisible();

  await banner.getByRole("button", { name: "Remove Now" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.waitForURL("**/dashboard");
  await expect(page.locator(".crow", { hasText: "Lumen Skin" })).toHaveCount(0);
  expect((await admin.from("clients").select("id").eq("id", clientId)).data).toEqual([]);
  expect((await admin.from("projects").select("id").eq("id", projectId)).data).toEqual([]);
  const { data: left } = await admin.storage.from("assets").list(`${frank.agencyId}/sample`, { limit: 100 });
  for (const f of left ?? []) {
    const { data: inner } = await admin.storage.from("assets").list(`${frank.agencyId}/sample/${f.name}`, { limit: 100 });
    expect(inner ?? []).toEqual([]);
  }
  // The agency's own client is untouched.
  expect((await admin.from("clients").select("id").eq("id", frank.clientId)).data).toHaveLength(1);
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

test("a User sees the banner but can't remove the sample", async ({ page, frank }) => {
  test.setTimeout(120_000);
  const clientId = await seed(frank.agencyId, frank.staffEmail);
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  const { data: mem } = await admin.from("memberships").update({ role: "user" }).eq("user_id", staffId).eq("agency_id", frank.agencyId).select("id").single();
  await admin.from("staff_client_access").insert({ membership_id: mem!.id, client_id: clientId });
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/clients/${clientId}`);
  await expect(page.locator(".samplebar")).toBeVisible();
  await expect(page.locator(".samplebar").getByRole("button", { name: "Remove Now" })).toHaveCount(0);
  const res = await page.request.post(`${APP_URL}/api/sample/remove`, { data: { clientId } });
  expect(res.status()).toBe(403);
  expect((await admin.from("clients").select("id").eq("id", clientId)).data).toHaveLength(1);
});

test("Preferences adds the sample to a workspace without one, keeps it, or lets it go after 7 days", async ({ page, frank }) => {
  test.setTimeout(150_000);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/settings/general/preferences`);
  const add = page.getByRole("button", { name: "Add the Sample Client" });
  await add.click();
  const choice = page.getByLabel("Sample client");
  await expect(choice).toHaveValue("remove", { timeout: 60_000 });
  const sample = (await admin.from("clients").select("id, sample_expires_at").eq("agency_id", frank.agencyId).eq("is_sample", true).single()).data!;
  expect(Math.abs(Date.parse(sample.sample_expires_at!) - (Date.now() + 7 * 86_400_000))).toBeLessThan(10 * 60_000);
  await expect(page.locator(".samplebar")).toContainText("removed in 7 days");

  // Kept: a date that never comes, so the clean-up never takes it.
  await choice.selectOption("keep");
  await expect(page.locator(".samplebar")).toContainText("kept until you remove it,");
  await expect
    .poll(async () => (await admin.from("clients").select("sample_expires_at").eq("id", sample.id).single()).data!.sample_expires_at)
    .toBe("infinity");
  const { data: expired } = await admin.from("clients").select("id").eq("id", sample.id).lt("sample_expires_at", new Date().toISOString());
  expect(expired).toEqual([]);
  await page.reload();
  await expect(page.getByLabel("Sample client")).toHaveValue("keep");

  // Back to 7 days, from now.
  await page.getByLabel("Sample client").selectOption("remove");
  await expect(page.locator(".samplebar")).toContainText("removed in 7 days");
  // One at a time.
  await expect(add).toHaveCount(0);
  const again = await page.request.post(`${APP_URL}/api/sample/add`, { data: { agencyId: frank.agencyId } });
  expect(again.status()).toBe(409);
});
