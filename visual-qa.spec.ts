// Temporary visual-QA script — not part of the app, safe to delete after
// use. Compares the static prototype's Upload Artwork modal against the
// live Next.js app's equivalent.
//
// The live app needs a real authenticated session to reach /creatives/[id],
// which nothing in this codebase can fake. This script creates a throwaway
// agency/user/client/project/creative via the service role key (bypassing
// RLS entirely, exactly as intended for admin scripts, never for app code),
// logs in as that user through the real /login form, takes its screenshots,
// then deletes every row it created — win or lose, via afterAll.
//
// Run with: npx playwright test visual-qa.spec.ts
// Requires: the Next.js dev server already running on :3000, and
// SUPABASE_SERVICE_ROLE_KEY set in .env.local.

import { test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// Playwright's test runner doesn't read .env.local the way Next.js dev
// does — load it explicitly (Node 20.6+'s built-in loader, no new
// dependency needed for a one-off script).
process.loadEnvFile(path.resolve(__dirname, ".env.local"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const APP_URL = "http://localhost:3000";
const PROTOTYPE_PATH = path.resolve(
  __dirname,
  "project-details/frank-prototype.html",
);

const TEST_EMAIL = `qa-visual-${Date.now()}@example.invalid`;
const TEST_PASSWORD = "Qa-Visual-Test-1234!";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface Fixture {
  authUserId: string;
  agencyId: string;
  clientId: string;
  projectId: string;
  creativeId: string;
}

let fixture: Fixture;

test.beforeAll(async () => {
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (authError || !authUser.user) throw authError ?? new Error("No user returned");

  const { data: agency, error: agencyError } = await admin
    .from("agencies")
    .insert({ name: "QA Visual Test Agency" })
    .select("id")
    .single();
  if (agencyError) throw agencyError;

  const { error: userRowError } = await admin
    .from("users")
    .insert({ id: authUser.user.id, email: TEST_EMAIL, name: "QA Visual Tester" });
  if (userRowError) throw userRowError;

  const { error: membershipError } = await admin.from("memberships").insert({
    agency_id: agency.id,
    user_id: authUser.user.id,
    role: "admin",
  });
  if (membershipError) throw membershipError;

  const { data: client, error: clientError } = await admin
    .from("clients")
    .insert({ agency_id: agency.id, name: "QA Visual Test Client" })
    .select("id")
    .single();
  if (clientError) throw clientError;

  const { data: project, error: projectError } = await admin
    .from("projects")
    .insert({ client_id: client.id, name: "QA Visual Test Project", delivery: "scheduled" })
    .select("id")
    .single();
  if (projectError) throw projectError;

  const { data: creative, error: creativeError } = await admin
    .from("creatives")
    .insert({
      project_id: project.id,
      name: "QA Visual Test Creative",
      format: "ig_feed",
      scheduled_at: new Date(Date.now() + 86400000).toISOString(),
      created_by: authUser.user.id,
    })
    .select("id")
    .single();
  if (creativeError) throw creativeError;

  fixture = {
    authUserId: authUser.user.id,
    agencyId: agency.id,
    clientId: client.id,
    projectId: project.id,
    creativeId: creative.id,
  };
});

test.afterAll(async () => {
  const dir = path.resolve(__dirname, "visual-qa-out");
  if (fs.existsSync(dir)) {
    console.log("Screenshots written to", dir, fs.readdirSync(dir));
  }

  if (!fixture) return;
  // Reverse dependency order. Best-effort — logged, not thrown, so one
  // failure doesn't stop the rest of cleanup from running.
  const steps: [string, () => PromiseLike<{ error: unknown }>][] = [
    ["creatives", () => admin.from("creatives").delete().eq("id", fixture.creativeId)],
    ["projects", () => admin.from("projects").delete().eq("id", fixture.projectId)],
    ["clients", () => admin.from("clients").delete().eq("id", fixture.clientId)],
    [
      "memberships",
      () => admin.from("memberships").delete().eq("agency_id", fixture.agencyId),
    ],
    ["agencies", () => admin.from("agencies").delete().eq("id", fixture.agencyId)],
    ["users", () => admin.from("users").delete().eq("id", fixture.authUserId)],
    ["auth user", () => admin.auth.admin.deleteUser(fixture.authUserId)],
  ];
  for (const [label, run] of steps) {
    const { error } = await run();
    if (error) console.error(`Cleanup failed at ${label}:`, error);
  }
});

async function loginAsTestUser(page: Page) {
  await page.goto(`${APP_URL}/login`);
  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${APP_URL}/dashboard`, { timeout: 15000 });
}

test("baseline: prototype Upload Artwork modal", async ({ page }) => {
  await page.goto(`file://${PROTOTYPE_PATH}`);
  await page.waitForSelector("#v-dash.on", { timeout: 10000 });

  // Click into the first client, then the first project, then a creative
  // that is NOT published — the prototype's own demo data, no fixture
  // needed here. A published/live creative blocks the Upload/Edit modal
  // (openUpload() -> blockLive()), so "Season opener teaser" (published)
  // doesn't work; "Academy gear — sponsored" is only "approved".
  await page.click("#clientList .crow:not(.head)");
  await page.waitForTimeout(400);
  await page.click("text=Social Media Management");
  await page.waitForTimeout(400);
  await page.click("text=Academy gear — sponsored");
  await page.waitForTimeout(500);

  await page.screenshot({ path: "visual-qa-out/baseline-review.png", fullPage: true });

  await page.click("#upEditBtn");
  await page.waitForSelector("#upScrim.on", { timeout: 5000 });
  await page.screenshot({ path: "visual-qa-out/baseline-modal.png" });
});

test("target: live app Upload Artwork modal", async ({ page }) => {
  await loginAsTestUser(page);
  await page.goto(`${APP_URL}/creatives/${fixture.creativeId}`);
  await page.waitForSelector(".stage-h");

  await page.screenshot({ path: "visual-qa-out/target-review.png", fullPage: true });

  await page.click('button:has-text("Upload Artwork")');
  await page.waitForSelector(".modal");
  await page.screenshot({ path: "visual-qa-out/target-modal.png" });
});

test.afterAll(async () => {
  // Just confirms the four files exist for the write-up — no pixel diffing
  // tool is wired in here, the comparison in the report is by inspection.
  const dir = path.resolve(__dirname, "visual-qa-out");
  if (fs.existsSync(dir)) {
    console.log("Screenshots written to", dir, fs.readdirSync(dir));
  }
});
