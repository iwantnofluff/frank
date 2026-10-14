import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";

// Deleting comments (phase97, direct instruction): the Primary Owner and
// Owners delete anyone's comment, their team's or a client's, and its
// replies go with it (decided directly). Nobody else can, in the page or
// the database.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
async function signIn(email: string, password: string) {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}
async function comment(c: SupabaseClient, agencyId: string, creativeId: string, body: string, parentId: string | null = null) {
  const { data: u } = await c.auth.getUser();
  const { data, error } = await c
    .from("comments")
    .insert({ agency_id: agencyId, creative_id: creativeId, author_id: u.user!.id, body, visibility: "public", parent_id: parentId })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}
const deletedAt = async (id: string) => (await admin.from("comments").select("deleted_at").eq("id", id).single()).data!.deleted_at;
const tryDelete = (c: SupabaseClient, id: string) => c.from("comments").update({ deleted_at: new Date().toISOString() }).eq("id", id).select("id");

test("an Owner deletes a client's comment and its replies; nobody else can", async ({ page, frank }) => {
  test.setTimeout(120_000);
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  const setRole = (role: string) =>
    admin.from("memberships").update({ role }).eq("user_id", staffId).eq("agency_id", frank.agencyId).select("id").single();

  // Seeded as the app writes them: the client's comment from the client's
  // session, the team's reply from the team's.
  const client = await signIn(frank.clientEmail, frank.clientPassword);
  const staff = await signIn(frank.staffEmail, frank.staffPassword);
  const theirs = await comment(client, frank.agencyId, frank.creativeId, "Client says make the logo bigger");
  const reply = await comment(staff, frank.agencyId, frank.creativeId, "Team says on it", theirs);
  const ours = await comment(staff, frank.agencyId, frank.creativeId, "Team note to keep");

  // An Admin, a client and a User are refused by the database.
  for (const [who, c] of [["Admin", staff], ["client", client]] as const) {
    const r = await tryDelete(c, who === "client" ? theirs : ours);
    expect(r.error?.message ?? "", `${who} refused`).toContain("Only Owners can delete a comment");
  }
  const { data: m } = await setRole("user");
  await admin.from("staff_client_access").insert({ membership_id: m!.id, client_id: frank.clientId });
  expect((await tryDelete(staff, ours)).error?.message ?? "").toContain("Only Owners can delete a comment");
  expect(await deletedAt(ours)).toBeNull();
  expect(await deletedAt(theirs)).toBeNull();

  // An Admin's page offers no Delete.
  await setRole("admin");
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const card = page.locator(`#cmt-${theirs}`);
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /^Delete (comment|reply)$/ })).toHaveCount(0);

  // An Owner deletes the client's comment; its reply goes too.
  await setRole("owner");
  await page.reload();
  await card.getByRole("button", { name: "Delete comment" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("this comment from E2E Client User and its reply will be gone for everyone");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(card).toHaveCount(0);
  expect(await deletedAt(theirs)).not.toBeNull();
  expect(await deletedAt(reply)).not.toBeNull();
  expect(await deletedAt(ours)).toBeNull();

  // A reply alone: the comment above it stays.
  const reply2 = await comment(client, frank.agencyId, frank.creativeId, "Client reply to drop", ours);
  await page.reload();
  const keep = page.locator(`#cmt-${ours}`);
  await keep.locator(".reply", { hasText: "Client reply to drop" }).getByRole("button", { name: "Delete reply" }).click();
  await expect(page.getByRole("dialog")).toContainText("this reply from E2E Client User will be gone");
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(keep.locator(".reply")).toHaveCount(0);
  await expect(keep).toContainText("Team note to keep");
  expect(await deletedAt(reply2)).not.toBeNull();

  // A review link shows neither.
  const token = await frank.createSharedLink();
  await page.goto(`${APP_URL}/review/${token}`);
  await expect(page.locator(".cmt", { hasText: "Team note to keep" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Client says make the logo bigger")).toHaveCount(0);
  await expect(page.getByText("Client reply to drop")).toHaveCount(0);
});
