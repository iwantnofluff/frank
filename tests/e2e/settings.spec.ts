import { test, expect } from "./fixtures";

test("settings — knowledge tab (default landing)", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto("/settings");
  await page.waitForURL(/\/settings\/knowledge/);
  // .settingsnav is the layout shell and renders instantly regardless of
  // data state — wait for the actual page content (useMyAgency +
  // useFormatDirections) via the always-present "+ Add format" control.
  await page.waitForSelector('button:has-text("Add format")');
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

// AddFormatForm used to accept free-text format_id; now it selects from
// lib/formats.ts's 41-entry catalog, ported from the prototype's FORMATS
// object.
test("settings — add a format from the catalog", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto("/settings/knowledge");
  await page.waitForSelector('button:has-text("Add format")');

  await page.click('button:has-text("Add format")');
  await page.selectOption("select", "ig_feed");
  await page.click('button:has-text("Add")');

  await expect(page.locator(".brief .bf-h", { hasText: "ig_feed" })).toBeVisible();
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
