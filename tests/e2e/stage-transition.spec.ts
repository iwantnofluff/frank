import { createClient } from "@supabase/supabase-js";
import { test, expect } from "./fixtures";

// advance_creative_stage() (supabase/migrations/phase9_advance_creative_stage.sql,
// extended by phase13_simplify_stage_pipeline.sql) is the only stage
// transition built: Internal Review, Client Review and Approved, any
// direction from any stage. Staff-only, verified against real
// authenticated sessions at the DB layer before any UI existed — these
// specs exercise the UI built on top of that.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

test("staff advances a creative to Client Review, making it visible through a shared link", async ({ page, frank }) => {
  const creativeId = await frank.createCreativeAtStage(1, "Advance To Review Test");
  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${creativeId}`);
  await page.waitForSelector(".stage-h");

  await page.click('.stagesw button:has-text("Client Review")');
  await expect(page.locator('.stagesw button[aria-pressed="true"]')).toHaveText("Client Review");

  await page.click('button[title="Share for review"]');
  await page.click('button[role="radio"]:has-text("Current Post")');
  await page.click('button:has-text("Create link")');
  await page.waitForSelector(".linkrow code");
  const shareLink = (await page.locator(".linkrow code").textContent())!.trim();

  const guestContext = await page.context().browser()!.newContext();
  const guestPage = await guestContext.newPage();
  await guestPage.goto(shareLink);
  await expect(guestPage.getByText("Advance To Review Test").first()).toBeVisible();
  await guestContext.close();
});

test("a real client-role session has no entry point and cannot advance a creative directly", async ({ page, frank }) => {
  const creativeId = await frank.createCreativeAtStage(1);
  await frank.loginAsClient(page);
  await page.goto(`/creatives/${creativeId}`);
  await page.waitForSelector(".stage-h");
  await expect(page.locator(".stagesw")).toHaveCount(0);

  // Not just UI absence — the RPC itself rejects a non-staff caller,
  // bypassing the page entirely.
  const clientSession = createClient(SUPABASE_URL, ANON_KEY);
  const { error: signInError } = await clientSession.auth.signInWithPassword({
    email: frank.clientEmail,
    password: frank.clientPassword,
  });
  expect(signInError).toBeNull();
  const { error: rpcError } = await clientSession.rpc("advance_creative_stage", {
    p_creative_id: creativeId,
    p_direction: "to_review",
  });
  expect(rpcError).not.toBeNull();
  expect(rpcError?.message).toContain("not permitted");
  await clientSession.auth.signOut();
});

test("ShareModal's eligibility warning clears once a creative moves to Client Review", async ({ page, frank }) => {
  const creativeId = await frank.createCreativeAtStage(1);
  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${creativeId}`);
  await page.waitForSelector(".stage-h");

  await page.click('button[title="Share for review"]');
  await page.click('button[role="radio"]:has-text("Current Post")');
  await expect(page.locator(".note.warn")).toContainText("This link will show nothing yet");
  await page.click('.modal-h button[title="Close"]');

  await page.click('.stagesw button:has-text("Client Review")');
  await expect(page.locator('.stagesw button[aria-pressed="true"]')).toHaveText("Client Review");

  await page.click('button[title="Share for review"]');
  await page.click('button[role="radio"]:has-text("Current Post")');
  await expect(page.locator(".note.warn")).toHaveCount(0);
});

test("staff can approve a creative directly, and revoke that approval", async ({ page, frank }) => {
  const creativeId = await frank.createCreativeAtStage(3, "Staff Approve Test");
  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${creativeId}`);
  await page.waitForSelector(".stage-h");

  await page.click('.stagesw button:has-text("Approved")');
  await expect(page.locator('.stagesw button[aria-pressed="true"]')).toHaveText("Approved");

  // Real attribution recorded, same shape as a guest approval gets.
  const admin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: approved } = await admin
    .from("creatives")
    .select("stage, approved_at, approved_by_name")
    .eq("id", creativeId)
    .single();
  expect(approved?.stage).toBe(4);
  expect(approved?.approved_at).not.toBeNull();
  expect(approved?.approved_by_name).not.toBeNull();

  // Revoke — moving back to Client Review clears the approval record.
  await page.click('.stagesw button:has-text("Client Review")');
  await expect(page.locator('.stagesw button[aria-pressed="true"]')).toHaveText("Client Review");
  const { data: revoked } = await admin
    .from("creatives")
    .select("stage, approved_at, approved_by_name")
    .eq("id", creativeId)
    .single();
  expect(revoked?.stage).toBe(3);
  expect(revoked?.approved_at).toBeNull();
  expect(revoked?.approved_by_name).toBeNull();
});

test("a real client-role session cannot call the staff approve direction either", async ({ frank }) => {
  const creativeId = await frank.createCreativeAtStage(3);
  const clientSession = createClient(SUPABASE_URL, ANON_KEY);
  const { error: signInError } = await clientSession.auth.signInWithPassword({
    email: frank.clientEmail,
    password: frank.clientPassword,
  });
  expect(signInError).toBeNull();
  const { error: rpcError } = await clientSession.rpc("advance_creative_stage", {
    p_creative_id: creativeId,
    p_direction: "to_approved",
  });
  expect(rpcError).not.toBeNull();
  expect(rpcError?.message).toContain("not permitted");
  await clientSession.auth.signOut();
});
