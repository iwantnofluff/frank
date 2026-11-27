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
