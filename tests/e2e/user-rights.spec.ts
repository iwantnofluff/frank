import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";

// What a User can't change (phase94, decided directly), checked with real
// signed-in sessions: Format Directions, Reference Material, and archiving
// a client or project are Owners' and Admins' only, in the database and on
// the page; the workspace's name shows as text, not a box.
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

test("a User can't change Format Directions, Reference Material, or archive a client or project; an Admin can", async ({ page, frank }) => {
  test.setTimeout(120_000);
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  const setRole = (role: string) => admin.from("memberships").update({ role }).eq("user_id", staffId).eq("agency_id", frank.agencyId).select("id").single();
  const { data: m } = await setRole("user");
  await admin.from("staff_client_access").insert({ membership_id: m!.id, client_id: frank.clientId });
  const { data: fd, error: fdError } = await admin.from("format_directions").insert({ agency_id: frank.agencyId, format_id: "ig_feed", direction_text: "Seeded" }).select("id").single();
  if (fdError) throw fdError;

  const session = async () => {
    const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
    await c.auth.signInWithPassword({ email: frank.staffEmail, password: frank.staffPassword });
    return c;
  };
  const changed = async (r: PromiseLike<{ data: unknown[] | null; error: unknown }>) => {
    const { data, error } = await r;
    return !error && (data?.length ?? 0) > 0;
  };

  // As a User.
  let u = await session();
  expect(await changed(u.from("format_directions").update({ direction_text: "By a User" }).eq("id", fd!.id).select("id"))).toBe(false);
  expect(await changed(u.from("agency_knowledge_entries").insert({ agency_id: frank.agencyId, title: "By a User", body: "x", kind: "text", created_by: staffId }).select("id"))).toBe(false);
  expect(await changed(u.from("clients").update({ archived_at: new Date().toISOString() }).eq("id", frank.clientId).select("id"))).toBe(false);
  expect(await changed(u.from("projects").update({ archived_at: new Date().toISOString() }).eq("id", frank.projectId).select("id"))).toBe(false);

  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/settings/general/account-name`);
  await expect(page.locator(".srow-val")).toHaveText("E2E Test Agency");
  await expect(page.getByLabel("Workspace name")).toHaveCount(0);
  await page.goto(`${APP_URL}/settings/knowledge/format-directions`);
  await expect(page.getByText("Only Owners and Admins can change them.")).toBeVisible();
  await expect(page.locator(".fd-row .fbtn")).toHaveCount(0);
  await page.goto(`${APP_URL}/settings/knowledge/reference-material`);
  await expect(page.getByText("Only Owners and Admins can add or remove Reference Material.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Write Note" })).toHaveCount(0);

  // As an Admin: all of it goes through.
  await setRole("admin");
  u = await session();
  expect(await changed(u.from("format_directions").update({ direction_text: "By an Admin" }).eq("id", fd!.id).select("id"))).toBe(true);
  // The same insert the User was refused, so it's the rule refusing it, not the row.
  expect(await changed(u.from("agency_knowledge_entries").insert({ agency_id: frank.agencyId, title: "By an Admin", body: "x", kind: "text", created_by: staffId }).select("id"))).toBe(true);
  expect(await changed(u.from("projects").update({ archived_at: new Date().toISOString() }).eq("id", frank.projectId).select("id"))).toBe(true);
  expect(await changed(u.from("projects").update({ archived_at: null }).eq("id", frank.projectId).select("id"))).toBe(true);
  await page.goto(`${APP_URL}/settings/knowledge/format-directions`);
  await expect(page.locator(".fd-row .fbtn").first()).toBeVisible();
  await page.goto(`${APP_URL}/settings/knowledge/reference-material`);
  await expect(page.getByRole("button", { name: "Write Note" })).toBeVisible();
});
