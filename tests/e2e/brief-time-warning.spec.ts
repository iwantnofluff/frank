import { test, expect } from "./fixtures";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import type { Page } from "@playwright/test";
process.loadEnvFile(path.resolve(__dirname, "../../.env.local"));
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Comment intelligence, Phase 1's brief-time warning
// (docs/frank-data-intelligence.pdf, "Where it surfaces — At the brief").
// Seeds already-classified comments directly (real classification depends
// on a live AI call, not something a permanent test should wait on — see
// shared-review-public.spec.ts's own classification test and
// docs/parity-gaps.md) so this test is deterministic and fast.
// The Format field is a multi-select now: tick the new one, untick the old.
async function swapFormat(page: Page, from: string, to: string) {
  await page.click("#nbFmt");
  const pop = page.getByRole("dialog", { name: "Formats" });
  await pop.getByRole("checkbox", { name: to, exact: true }).click();
  await pop.getByRole("checkbox", { name: from, exact: true }).click();
  await page.keyboard.press("Escape");
}

test("New Brief shows a repeat-issue warning scoped to the format being chosen", async ({
  page,
  frank,
}) => {
  const { data: staffUser } = await admin
    .from("users")
    .select("id")
    .eq("email", frank.staffEmail)
    .single();

  const { data: secondCreative } = await admin
    .from("creatives")
    .insert({
      project_id: frank.projectId,
      name: "Second Story Creative",
      format: "ig_story",
      stage: 3,
      scheduled_at: "2027-03-16T14:00:00.000Z",
      created_by: staffUser!.id,
    })
    .select("id")
    .single();

  await admin.from("creatives").update({ format: "ig_story" }).eq("id", frank.creativeId);

  await admin.from("comments").insert([
    {
      creative_id: frank.creativeId,
      guest_name: "Guest One",
      body: "Text too close to the Story interface edge.",
      visibility: "public",
      issue_category: "craft_and_layout",
      issue_category_note: "Layout issue near the interface edge.",
    },
    {
      creative_id: secondCreative!.id,
      guest_name: "Guest Two",
      body: "Text too close to the edge again.",
      visibility: "public",
      issue_category: "craft_and_layout",
      issue_category_note: "Layout issue near the interface edge.",
    },
  ]);

  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector('button:has-text("New Post")');
  await page.click('button:has-text("New Post")');
  await page.waitForSelector("#nbFmt");

  await swapFormat(page, "Instagram Feed", "Instagram Story");
  const warning = page.locator(".note", { hasText: "Craft and Layout" });
  await expect(warning).toBeVisible();
  await expect(warning).toContainText("2");
  await expect(warning).toContainText("Instagram Story");

  // A format with no matching history shows nothing.
  await swapFormat(page, "Instagram Story", "Instagram Feed");
  await expect(page.locator(".note", { hasText: "Craft and Layout" })).toHaveCount(0);
});

test("New Brief shows no warning for a client with fewer than two matching issues", async ({
  page,
  frank,
}) => {
  await admin.from("creatives").update({ format: "ig_story" }).eq("id", frank.creativeId);
  await admin.from("comments").insert({
    creative_id: frank.creativeId,
    guest_name: "Guest",
    body: "Text too close to the edge.",
    visibility: "public",
    issue_category: "craft_and_layout",
    issue_category_note: "Layout issue near the interface edge.",
  });

  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector('button:has-text("New Post")');
  await page.click('button:has-text("New Post")');
  await page.waitForSelector("#nbFmt");
  await swapFormat(page, "Instagram Feed", "Instagram Story");
  await page.waitForTimeout(800);
  await expect(page.locator(".note", { hasText: "Craft and Layout" })).toHaveCount(0);
});
