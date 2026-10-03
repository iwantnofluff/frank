import { test, expect } from "./fixtures";

test("settings — Knowledge → Format Directions", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto("/settings/knowledge/format-directions");
  // The menu renders at once; wait for the page's own content.
  await page.waitForSelector(".fd-cat");
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
    // The email cell is the row's second column; matched as a direct
    // child, since the name cell now has its own nested divs (photo, name).
    mask: [row.locator(":scope > div").nth(1)],
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
  await expect(page.locator(".setnav")).toHaveCount(0);
});

test("settings — the left menu: sections open one at a time, pages have their own addresses", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto("/settings");
  await page.waitForURL(/\/settings\/general\/account-name$/);
  const nav = page.getByRole("navigation", { name: "Settings sections" });
  await expect(nav.getByRole("button", { name: "General" })).toHaveAttribute("aria-expanded", "true");
  await expect(nav.getByRole("link", { name: "Account Name" })).toHaveAttribute("aria-current", "true");

  // Opening another section closes the first.
  await nav.getByRole("button", { name: "Billing" }).click();
  await expect(nav.getByRole("link", { name: "Account Name" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: /^Invoices/ })).toContainText("Soon");
  await nav.getByRole("link", { name: /^Invoices/ }).click();
  await page.waitForURL(/\/settings\/billing\/invoices$/);
  await expect(page.getByRole("heading", { name: "Coming soon" })).toHaveCount(0);
  await expect(page.locator(".panel-h", { hasText: "Coming soon" })).toBeVisible();

  // Colour Presets and Interface Colours are one page now.
  await page.goto("/settings/customisation/colour-presets");
  await page.waitForURL(/\/settings\/customisation\/brand-colours$/);
  await expect(page.getByRole("heading", { name: "Brand Colours" })).toBeVisible();
  await expect(page.locator(".panel-h", { hasText: "Colour Presets" })).toBeVisible();
  await expect(page.locator(".panel-h", { hasText: "Interface Colours" })).toBeVisible();

  // Old addresses still land somewhere sensible.
  await page.goto("/settings/team");
  await page.waitForURL(/\/settings\/team\/users$/);
  await expect(nav.getByRole("button", { name: "Team" })).toHaveAttribute("aria-expanded", "true");

  // The whole menu collapses, like the review page's.
  await nav.getByRole("button", { name: "Hide settings menu" }).click();
  await expect(nav.getByRole("button", { name: "General" })).toHaveCount(0);
  await nav.getByRole("button", { name: "Show settings menu" }).click();
  await expect(nav.getByRole("button", { name: "General" })).toBeVisible();
});

test("settings — Account URL shows the agency's own address", async ({ page, frank }) => {
  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const sub = `e2eu${Date.now().toString(36)}`;
  await admin.from("agencies").update({ subdomain: sub }).eq("id", frank.agencyId);
  await frank.loginAsStaff(page);
  await page.goto("/settings/general/account-url");
  await expect(page.locator(".srow")).toContainText(`${sub}.beingfrank.app`);
  await expect(page.getByRole("button", { name: "Copy" })).toBeVisible();
});
