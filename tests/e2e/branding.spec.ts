import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { test, expect, APP_URL } from "./fixtures";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function cssVar(page: Page, name: string) {
  return page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
}

async function waitForVar(page: Page, name: string, value: string) {
  await expect.poll(() => cssVar(page, name), { timeout: 10_000 }).toBe(value);
}

test("a preset previews live, reverts if not saved, and applies everywhere once saved", async ({
  page,
  browser,
  frank,
}) => {
  test.setTimeout(90_000);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/settings/brand`);
  const forest = page.getByRole("button", { name: "Forest" });
  await expect(page.getByRole("button", { name: "No Fluff" })).toHaveAttribute("aria-pressed", "true");

  await forest.click();
  await expect(forest).toHaveAttribute("aria-pressed", "true");
  await waitForVar(page, "--action", "#047857");
  await expect(page.locator(".unsaved")).toHaveText("Unsaved changes");

  // Leaving without saving puts the saved theme back.
  await page.getByRole("link", { name: "Clients" }).click();
  await page.waitForURL(`${APP_URL}/dashboard`);
  await waitForVar(page, "--action", "#007BFF");

  await page.goto(`${APP_URL}/settings/brand`);
  await forest.click();
  await page.getByRole("button", { name: "Save Branding" }).click();
  await expect(page.getByRole("status")).toHaveText("Branding saved");

  const { data: row } = await admin.from("agency_settings").select("theme").eq("agency_id", frank.agencyId).single();
  expect(row!.theme).toMatchObject({ action: "#047857", rail: "#0F1B17", hl: "#FFFBF0", private: "#FF5590" });

  await page.goto(`${APP_URL}/dashboard`);
  await waitForVar(page, "--action", "#047857");
  await waitForVar(page, "--rail", "#0F1B17");

  const clientContext = await browser.newContext();
  const clientPage = await clientContext.newPage();
  await frank.loginAsClient(clientPage);
  await waitForVar(clientPage, "--action", "#047857");
  await clientContext.close();

  const token = await frank.createSharedLink();
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(`${APP_URL}/review/${token}`);
  await waitForVar(guest, "--action", "#047857");
  await guestContext.close();
});

test("hex edits, saved presets and Reset to Default", async ({ page, frank }) => {
  test.setTimeout(60_000);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/settings/brand`);

  const hex = page.getByLabel("Primary Action hex");
  await hex.fill("not a colour");
  await hex.blur();
  await expect(hex).toHaveValue("#007BFF");
  await hex.fill("#123456");
  await hex.blur();
  await waitForVar(page, "--action", "#123456");
  await expect(page.getByRole("button", { name: "No Fluff" })).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("button", { name: "Save current as preset" }).click();
  const dialog = page.getByRole("dialog", { name: "Save Colour Preset" });
  await dialog.getByLabel("Preset Name").fill("Forest");
  await dialog.getByRole("button", { name: "Save Preset" }).click();
  await expect(dialog.locator(".autherr")).toHaveText('"Forest" is a built-in preset — pick another name');
  await dialog.getByLabel("Preset Name").fill("Kabir & Sons");
  await dialog.getByRole("button", { name: "Save Preset" }).click();
  await expect(dialog).toHaveCount(0);
  const mine = page.locator(".pre.custom", { hasText: "Kabir & Sons" });
  await expect(mine).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Save Branding" }).click();
  await expect(page.getByRole("status")).toHaveText("Branding saved");
  const { data: saved } = await admin
    .from("agency_settings")
    .select("theme, custom_presets")
    .eq("agency_id", frank.agencyId)
    .single();
  expect(saved!.theme.action).toBe("#123456");
  expect(Object.keys(saved!.custom_presets)).toEqual(["Kabir & Sons"]);

  await page.getByRole("button", { name: "Reset to Default" }).click();
  await expect(page.getByRole("button", { name: "No Fluff" })).toHaveAttribute("aria-pressed", "true");
  await waitForVar(page, "--action", "#007BFF");
  await page.getByRole("button", { name: "Delete preset Kabir & Sons", exact: true }).click();
  await expect(mine).toHaveCount(0);
  await page.getByRole("button", { name: "Save Branding" }).click();
  await expect(page.getByRole("status")).toHaveText("Branding saved");
  const { data: after } = await admin
    .from("agency_settings")
    .select("theme, custom_presets")
    .eq("agency_id", frank.agencyId)
    .single();
  expect(after!.theme.action).toBe("#007BFF");
  expect(after!.custom_presets).toEqual({});
});

test("the agency logo shows on the rail, for clients, and on review links", async ({ page, browser, frank }) => {
  test.setTimeout(90_000);
  let storageKey: string | null = null;
  try {
    await frank.loginAsStaff(page);
    await page.goto(`${APP_URL}/settings/brand`);
    const b64 = await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 600;
      c.height = 300;
      const g = c.getContext("2d")!;
      g.fillStyle = "#0f766e";
      g.fillRect(0, 0, 600, 300);
      return c.toDataURL("image/png").split(",")[1];
    });
    await page.getByLabel("Agency logo file").setInputFiles({
      name: "agency.png",
      mimeType: "image/png",
      buffer: Buffer.from(b64, "base64"),
    });
    const cropper = page.getByRole("dialog", { name: "Position the agency logo" });
    await cropper.getByRole("button", { name: "Use image" }).click();
    await expect(page.getByRole("button", { name: "Remove" })).toBeVisible({ timeout: 20_000 });

    const { data: s } = await admin
      .from("agency_settings")
      .select("logo_asset_id")
      .eq("agency_id", frank.agencyId)
      .single();
    const { data: a } = await admin.from("assets").select("storage_key").eq("id", s!.logo_asset_id).single();
    storageKey = a!.storage_key;
    expect(storageKey).toMatch(new RegExp(`^${frank.agencyId}/agency-logo/`));

    const railLogo = page.locator(".rail .mark img");
    await expect(railLogo).toBeVisible();

    const clientContext = await browser.newContext();
    const clientPage = await clientContext.newPage();
    await frank.loginAsClient(clientPage);
    const clientRailLogo = clientPage.locator(".rail .mark img");
    await expect(clientRailLogo).toBeVisible();
    await expect.poll(() => clientRailLogo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(512);
    await clientContext.close();

    const token = await frank.createSharedLink();
    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    await guest.goto(`${APP_URL}/review/${token}`);
    await expect(guest.locator(".m-logo img").first()).toBeVisible();
    await guestContext.close();

    await page.getByRole("button", { name: "Remove" }).click();
    await expect(railLogo).toHaveCount(0);
    await expect(page.locator(".rail .mark")).toHaveText("F");
  } finally {
    if (storageKey) await admin.storage.from("assets").remove([storageKey]);
  }
});

test("a User can see Branding but not change it", async ({ page, frank }) => {
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  await admin.from("memberships").update({ role: "user" }).eq("agency_id", frank.agencyId).eq("user_id", staffId);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/settings/brand`);
  await expect(page.getByText("Only Admins, Owners and the Primary Owner can change branding.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Branding" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Forest" })).toBeDisabled();
});
