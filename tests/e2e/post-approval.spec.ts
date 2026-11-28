import { createClient } from "@supabase/supabase-js";
import { test, expect } from "./fixtures";

// Approving a post at Client (phase170, direct instruction): an Approve
// button beside Post for the client's people and the team. It moves the post
// to Approved, records who approved it, and leaves "Client Approved" or
// "Approved" in their name. The team moving a post to Approved by its status
// leaves the same "Approved" comment.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const post = async (id: string) =>
  (await admin.from("creatives").select("stage, approved_at, approved_by_email").eq("id", id).single()).data!;
const comments = async (id: string) =>
  (await admin.from("comments").select("body, author_id, visibility").eq("creative_id", id)).data;
const userId = async (email: string) => (await admin.from("users").select("id").eq("email", email).single()).data!.id;

test("a client approves a post at Client from its comments", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const id = await frank.createCreativeAtStage(4, "Client Approves Post");
  await frank.loginAsClient(page);
  await page.goto(`/creatives/${id}`);
  const approve = page.locator(".composer").getByRole("button", { name: "Approve", exact: true });
  await expect(approve).toBeVisible({ timeout: 15_000 });
  await approve.click();
  // Approved, shown on its stage; past Client a client has no comments
  // panel (26 Nov 2026), so it closes, as after Approve Concept.
  await expect(page.getByRole("button", { name: "Approved", exact: true })).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });
  await expect(page.locator(".composer")).toHaveCount(0);
  const p = await post(id);
  expect(p.stage).toBe(5);
  expect(p.approved_at).not.toBeNull();
  expect(p.approved_by_email).toBe(frank.clientEmail);
  expect(await comments(id)).toEqual([{ body: "Client Approved", author_id: await userId(frank.clientEmail), visibility: "public" }]);
});

test("the team approves with the button, or by the Approved status; nobody approves outside Client", async ({ page, frank }) => {
  test.setTimeout(120_000);
  const byButton = await frank.createCreativeAtStage(4, "Team Approves Post");
  const byStatus = await frank.createCreativeAtStage(4, "Team Picks Approved");
  const internal = await frank.createCreativeAtStage(3, "Still Internal");
  const staffId = await userId(frank.staffEmail);
  await frank.loginAsStaff(page);

  await page.goto(`/creatives/${byButton}`);
  await page.locator(".composer").getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.locator(".cmt", { hasText: "Approved" })).toBeVisible({ timeout: 15_000 });
  expect((await post(byButton)).stage).toBe(5);
  expect(await comments(byButton)).toEqual([{ body: "Approved", author_id: staffId, visibility: "public" }]);

  // The status at the top: the same comment, shown straight away.
  await page.goto(`/creatives/${byStatus}`);
  await page.getByRole("button", { name: "Approved", exact: true }).click();
  await expect(page.locator(".cmt", { hasText: "Approved" })).toBeVisible({ timeout: 15_000 });
  expect((await post(byStatus)).stage).toBe(5);
  expect(await comments(byStatus)).toEqual([{ body: "Approved", author_id: staffId, visibility: "public" }]);
  // To Live and back keeps its approval, with no second comment.
  await page.getByRole("button", { name: "Live", exact: true }).click();
  await expect.poll(async () => (await post(byStatus)).stage).toBe(6);
  await page.getByRole("button", { name: "Approved", exact: true }).click();
  await expect.poll(async () => (await post(byStatus)).stage).toBe(5);
  expect(await comments(byStatus)).toHaveLength(1);

  // Not at Internal: no button, and the database refuses a client.
  await page.goto(`/creatives/${internal}`);
  await expect(page.locator(".composer")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".composer").getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email: frank.clientEmail, password: frank.clientPassword });
  const { error } = await c.rpc("approve_post", { p_creative_id: internal });
  expect(error?.message).toBe("This post isn't waiting on the client's review");
  expect((await post(internal)).stage).toBe(3);
});

// The client's Preferences can say the agency approves (phase171, decided
// directly): then the client's people get no Approve, and are refused, as on
// a review link; the team still approves.
test("when the agency approves, a client has no Approve and is refused; the team still approves", async ({ page, frank }) => {
  test.setTimeout(120_000);
  const id = await frank.createCreativeAtStage(4, "Agency Approves Post");
  const { error: pe } = await admin
    .from("client_preferences")
    .upsert({ client_id: frank.clientId, agency_id: frank.agencyId, client_can_approve: false }, { onConflict: "client_id" });
  if (pe) throw pe;

  await frank.loginAsClient(page);
  await page.goto(`/creatives/${id}`);
  await expect(page.locator(".composer")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".composer").getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email: frank.clientEmail, password: frank.clientPassword });
  const { error } = await c.rpc("approve_post", { p_creative_id: id });
  expect(error?.message).toContain("Your agency approves posts for you");
  expect((await post(id)).stage).toBe(4);

  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await s.auth.signInWithPassword({ email: frank.staffEmail, password: frank.staffPassword });
  const { error: staffError } = await s.rpc("approve_post", { p_creative_id: id });
  expect(staffError).toBeNull();
  expect((await post(id)).stage).toBe(5);
});
