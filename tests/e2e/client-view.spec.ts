import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";

// What a client's own login sees (direct instruction, after going through
// it page by page): a post's stage pills, but not to change; no Share, no
// Private filter (they never see a private comment); and no saving a
// planner view. The database refuses both changes as well.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

test("a client sees a post's stage but can't change it, share it, or filter by Private", async ({ page, frank }) => {
  test.setTimeout(60_000);
  await frank.insertCommentAsStaff("A public note from the team", "public");
  await frank.loginAsClient(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  // The fixture's post is in Client Review: shown, pressed, not pickable.
  const pills = page.locator(".stagesw.ro");
  await expect(pills).toBeVisible({ timeout: 15_000 });
  await expect(pills.getByRole("button", { name: "Client Review" })).toHaveAttribute("aria-pressed", "true");
  for (const name of ["Internal Review", "Approved", "Live"]) {
    await expect(pills.getByRole("button", { name, exact: true })).toHaveAttribute("aria-disabled", "true");
  }
  await pills.getByRole("button", { name: "Approved", exact: true }).click({ force: true });
  await page.waitForTimeout(1500);
  expect((await admin.from("creatives").select("stage").eq("id", frank.creativeId).single()).data!.stage).toBe(3);
  await expect(page.getByRole("button", { name: "Share for review" })).toHaveCount(0);
  await expect(page.locator(".cmt", { hasText: "A public note from the team" })).toBeVisible();
  await expect(page.locator(".cfilters button", { hasText: "Private" })).toHaveCount(0);

  // The database refuses a client's stage change.
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  await client.auth.signInWithPassword({ email: frank.clientEmail, password: frank.clientPassword });
  const moved = await client.rpc("advance_creative_stage", { p_creative_id: frank.creativeId, p_direction: "to_approved" });
  expect(moved.error).not.toBeNull();

  // The planner: no adding or saving a view, and the database agrees.
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  await page.waitForSelector(".viewbar");
  await expect(page.locator(".vadd")).toHaveCount(0);
  const saved = await client.from("calendar_views").insert({ agency_id: frank.agencyId, table_type: "scheduled", name: "Client View" }).select("id");
  expect(saved.data ?? []).toHaveLength(0);
});
