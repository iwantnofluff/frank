import { createClient } from "@supabase/supabase-js";
import { test, expect } from "./fixtures";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

test("creates a client end to end", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto("/dashboard");
  await page.waitForSelector(".clients, .empty");

  await page.click('button:has-text("New Client")');
  await page.fill("#cName", "New Client E2E — Lotus Skincare");
  await page.fill("#cInd", "D2C beauty");
  await page.click('button:has-text("Create Client")');

  await expect(page.locator(".scrim")).toHaveCount(0);
  await expect(
    page.locator(".crow", { hasText: "New Client E2E — Lotus Skincare" }),
  ).toBeVisible();

  // Its default Discovery notes (phase172), each Pending, in order.
  const { data: made } = await admin.from("clients").select("id").eq("agency_id", frank.agencyId).eq("name", "New Client E2E — Lotus Skincare").single();
  const { data: notes } = await admin.from("knowledge_entries").select("section, title, body").eq("client_id", made!.id).order("created_at");
  const by = (section: string) => (notes ?? []).filter((n) => n.section === section).map((n) => n.title);
  expect(by("protected_terms")).toEqual(["Copy Do's", "Copy Don'ts", "Creative Do's", "Creative Don'ts"]);
  expect(by("audience")).toEqual(["Primary TG", "Secondary TG"]);
  expect(new Set((notes ?? []).map((n) => n.body))).toEqual(new Set(["Pending"]));
  // Shown under Client Rules, Pending in red.
  await page.goto(`/clients/${made!.id}/settings/knowledge`);
  const rules = page.locator("#kb-protected_terms");
  await expect(rules.locator(".panel-h b")).toHaveText("Client Rules");
  await expect(rules.locator(".kb-pending")).toHaveCount(4);
});

test("missing name is caught before submit", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto("/dashboard");
  await page.waitForSelector(".clients, .empty");

  await page.click('button:has-text("New Client")');
  await page.click('button:has-text("Create Client")');

  await expect(page.locator(".autherr", { hasText: "Give the client a name" })).toBeVisible();
  await expect(page.locator(".scrim")).toHaveCount(1);
});

test("a real client-role session has no New Client entry point", async ({ page, frank }) => {
  await frank.loginAsClient(page);
  await page.goto("/dashboard");
  await page.waitForSelector(".clients, .empty");

  await expect(page.locator('button:has-text("New Client")')).toHaveCount(0);
});

// Only Owners and Admins may add a client (reported directly: a User's New
// Client ended in a row-level security error). A User doesn't see it, and
// the database still refuses one.
test("a User has no New Client, and can't add one in the database", async ({ page, frank }) => {
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  const { data: m, error } = await admin.from("memberships").update({ role: "user" }).eq("user_id", staffId).eq("agency_id", frank.agencyId).select("id").single();
  if (error) throw error;
  await admin.from("staff_client_access").insert({ membership_id: m!.id, client_id: frank.clientId });

  await frank.loginAsStaff(page);
  await page.goto("/dashboard");
  await expect(page.locator(".crow").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Active", exact: false })).toBeVisible();
  await expect(page.locator('button:has-text("New Client")')).toHaveCount(0);

  const u = anon();
  await u.auth.signInWithPassword({ email: frank.staffEmail, password: frank.staffPassword });
  const { error: refused } = await u.from("clients").insert({ agency_id: frank.agencyId, name: "Not Allowed" });
  expect(refused?.message).toMatch(/row-level security/);
});
