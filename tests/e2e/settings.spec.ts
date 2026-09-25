import { test, expect } from "./fixtures";

test("settings — knowledge tab (default landing)", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto("/settings");
  await page.waitForURL(/\/settings\/knowledge/);
  // .settingsnav is the layout shell and renders instantly regardless of
  // data state — wait for the actual page content (useMyAgency +
  // useFormatDirections), via the always-present first category row.
  await page.waitForSelector(".fd-cat");
  // Drafting Model's query needs to settle too (agencies.ai_default_model
  // doesn't exist until phase12_ai_drafting.sql is applied) — same
  // default-3-retry race as Reference Material below, just a different
  // panel racing the same pending-migration error state.
  await page.waitForSelector(
    ".panel-h:has-text(\"Drafting Model\") ~ .bsec select, .panel-h:has-text(\"Drafting Model\") ~ .bsec .autherr",
    { timeout: 20000 },
  );
  // Reference Material's query needs to settle (it 404s until
  // phase11_agency_knowledge.sql is applied — see docs/parity-gaps.md) so
  // the screenshot isn't racing its default-3-retry error state.
  await page.waitForSelector(
    ".panel-h:has-text(\"Reference Material\"), .empty:has-text(\"reference\")",
    { timeout: 20000 },
  );
  await expect(page).toHaveScreenshot("settings-knowledge.png");
});

test("settings — team roster", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto("/settings/team");
  // useTeamMembers' `user:users(...)` embed used to be ambiguous
  // (memberships has two FKs to users: user_id and invited_by), which
  // PostgREST rejected for every caller — the page silently landed on its
  // "Couldn't load the team" error state. Assert the real row renders,
  // not just that the page doesn't crash, or a regression back to the
  // ambiguous embed would pass unnoticed again.
  await page.waitForSelector(".clients, .empty");
  await expect(page.locator(".empty")).toHaveCount(0);
  const row = page.locator(".crow:not(.head)").first();
  await expect(row).toContainText("E2E Staff");
  await expect(row).toContainText(frank.staffEmail);
  // The fixture's email is stamp-generated (frank.staffEmail embeds
  // Date.now() + a random suffix) — its rendered width varies run to run,
  // which would make a plain screenshot flaky on nothing but string
  // length. Mask that column; the content assertions above already cover
  // it precisely.
  await expect(page).toHaveScreenshot("settings-team.png", {
    mask: [row.locator("div").nth(1)],
  });
});

// Format Directions now lists the whole 41-format catalog up front, grouped
// by category (lib/formats.ts) — there's no more opt-in "+ Add format"
// picker (docs/parity-gaps.md). Only the first category starts open.
test("settings — edit a format direction inline", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto("/settings/knowledge");
  await page.waitForSelector(".fd-cat");

  const row = page.locator(".fd-row", { hasText: "Instagram Feed" });
  await expect(row).toBeVisible();
  await expect(row.locator(".fd-m")).toContainText("no caption");

  await row.locator("button.fbtn", { hasText: "Edit" }).click();
  await row.locator("textarea.bin").fill("Keep the hook in the first line.");
  await row.locator('input[type="number"]').first().fill("125");
  await row.locator("button.btn.primary.sm", { hasText: "Save" }).click();

  await expect(row.locator(".fd-d")).toHaveText("Keep the hook in the first line.");
  await expect(row.locator(".fd-m")).toContainText("125 chars");
});

// Settings/layout.tsx guards every /settings/* route directly, not just
// NavRail's link — a client typing the URL should never render staff
// configuration (docs/parity-gaps.md, client-view audit).
test("settings — a real client-role session is redirected away", async ({ page, frank }) => {
  await frank.loginAsClient(page);
  await page.goto("/settings/brand");
  await page.waitForURL(/\/dashboard$/, { timeout: 15000 });
  await expect(page.locator(".settingsnav")).toHaveCount(0);
});
