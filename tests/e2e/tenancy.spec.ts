import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { test, expect, type Frank } from "./fixtures";

// Each agency at its own address (phase36), tried on the local shapes from
// lib/tenant.ts: frank.localhost:3000 is beingfrank.app, and
// <name>.frank.localhost:3000 is <name>.beingfrank.app. Chrome sends any
// *.localhost to this machine.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const at = (sub: string | null, path = "/") => `http://${sub ? `${sub}.` : ""}frank.localhost:3000${path}`;

async function signIn(page: Page, sub: string, email: string, password: string) {
  await page.goto(at(sub, "/login"));
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
}

// The fixture's agency at its own address, plus a second agency the
// fixture's staff member also belongs to (with a client of its own).
async function twoAgencies(frank: Frank) {
  const stamp = Date.now().toString(36);
  const mine = `e2e${stamp}`;
  const other = `e2eo${stamp}`;
  await admin.from("agencies").update({ subdomain: mine }).eq("id", frank.agencyId);
  const { data: agency } = await admin.from("agencies").insert({ name: "E2E Other Agency", subdomain: other }).select("id").single();
  const { data: staffUser } = await admin.from("users").select("id").eq("email", frank.staffEmail).single();
  await admin.from("memberships").insert({
    agency_id: agency!.id,
    user_id: staffUser!.id,
    role: "owner",
    accepted_at: new Date().toISOString(),
  });
  await admin.from("clients").insert({ agency_id: agency!.id, name: "Other Agency Client E2E" });
  return {
    mine,
    other,
    otherId: agency!.id as string,
    async cleanup() {
      await admin.from("clients").delete().eq("agency_id", agency!.id);
      await admin.from("memberships").delete().eq("agency_id", agency!.id);
      await admin.from("agencies").delete().eq("id", agency!.id);
    },
  };
}

test("beingfrank.app is a holding page, at any path, with no sign-in", async ({ page }) => {
  for (const path of ["/", "/dashboard", "/login"]) {
    await page.goto(at(null, path));
    await expect(page.getByText("Content review and approval for agencies. Coming soon.")).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  }
  await page.goto(at("www", "/"));
  await expect(page.getByText("Coming soon.", { exact: false })).toBeVisible();
});

test("an address that isn't an agency says so", async ({ page }) => {
  const res = await page.goto(at("no-such-workspace-e2e", "/login"));
  expect(res!.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "No workspace here" })).toBeVisible();
});

test("an agency's address shows only that agency's work, even to someone in two", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const agencies = await twoAgencies(frank);
  try {
    await signIn(page, agencies.mine, frank.staffEmail, frank.staffPassword);
    await page.waitForURL(at(agencies.mine, "/dashboard"), { timeout: 20_000 });
    await expect(page.locator(".crow", { hasText: "E2E Test Client" })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".crow", { hasText: "Other Agency Client E2E" })).toHaveCount(0);

    // The other agency's address has its own sign-in, and shows only its work.
    await signIn(page, agencies.other, frank.staffEmail, frank.staffPassword);
    await page.waitForURL(at(agencies.other, "/dashboard"), { timeout: 20_000 });
    await expect(page.locator(".crow", { hasText: "Other Agency Client E2E" })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".crow", { hasText: "E2E Test Client" })).toHaveCount(0);
  } finally {
    await agencies.cleanup();
  }
});

test("signing in at an agency you're not part of is stopped", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const agencies = await twoAgencies(frank);
  try {
    // The fixture's client member belongs only to the fixture's agency.
    await signIn(page, agencies.other, frank.clientEmail, frank.clientPassword);
    await expect(page.getByRole("heading", { name: "Not part of this workspace" })).toBeVisible({ timeout: 20_000 });
    await page.goto(at(agencies.other, "/projects"));
    await expect(page.getByRole("heading", { name: "Not part of this workspace" })).toBeVisible();
  } finally {
    await agencies.cleanup();
  }
});

test("in the database, the agency header only ever narrows", async ({ frank }) => {
  const agencies = await twoAgencies(frank);
  try {
    const as = async (header: string | null) => {
      const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: header ? { "x-frank-agency": header } : {} },
      });
      await c.auth.signInWithPassword({ email: frank.staffEmail, password: frank.staffPassword });
      const { data } = await c.from("clients").select("name").in("name", ["E2E Test Client", "Other Agency Client E2E"]);
      return (data ?? []).map((r) => r.name).sort();
    };
    // No header (plain localhost, the old address): both, as before.
    expect(await as(null)).toEqual(["E2E Test Client", "Other Agency Client E2E"]);
    expect(await as(agencies.mine)).toEqual(["E2E Test Client"]);
    expect(await as(agencies.other)).toEqual(["Other Agency Client E2E"]);
    // A name they're not in, or that doesn't exist, shows nothing at all.
    expect(await as("nofluff")).toEqual([]);
    expect(await as("does-not-exist")).toEqual([]);
  } finally {
    await agencies.cleanup();
  }
});
