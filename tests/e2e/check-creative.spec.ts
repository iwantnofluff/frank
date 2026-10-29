import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";

// Check Creative (direct instruction): the latest artwork, slide by slide,
// against its saved Text on Image. A live AI answer is checked by hand, never
// here: these cover what's decided before any AI call.
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function openChecks(page: import("@playwright/test").Page, creativeId: string) {
  await page.goto(`${APP_URL}/creatives/${creativeId}`);
  await expect(async () => {
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("tab", { name: "Checks" }).click({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}
const usage = async (agencyId: string) =>
  (await admin.from("ai_usage_events").select("id", { count: "exact", head: true }).eq("agency_id", agencyId)).count ?? 0;

test("Check Creative waits for artwork and Text on Image, and says why", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await frank.loginAsStaff(page);
  await openChecks(page, frank.creativeId);
  const button = page.getByRole("button", { name: "Check Creative" });
  await expect(button).toBeDisabled();
  await expect(page.getByText("Upload the artwork first, then check it against its Text on Image.")).toBeVisible();
  // The placeholder's made-up results are gone.
  await expect(page.getByText(/placeholder output/)).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel" }).click();

  await frank.createArtworkVersion(frank.creativeId, 1, "art.png");
  await openChecks(page, frank.creativeId);
  await expect(button).toBeDisabled();
  await expect(page.getByText("Write the Text on Image on the Production tab first, then check the artwork against it.")).toBeVisible();
});

test("Check Creative needs a Claude model, and says so without calling the AI", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await admin.from("agencies").update({ ai_default_model: "gpt-4.1" }).eq("id", frank.agencyId);
  await admin.from("creatives").update({ slide_text: ["We spot the problem"] }).eq("id", frank.creativeId);
  await frank.createArtworkVersion(frank.creativeId, 1, "art.png");
  await frank.loginAsStaff(page);
  await openChecks(page, frank.creativeId);
  await page.getByRole("button", { name: "Check Creative" }).click();
  await expect(page.getByText(/needs a Claude model\. An Owner or Admin can choose one in Settings → AI Governance → Drafting Model\./)).toBeVisible({ timeout: 15_000 });
  expect(await usage(frank.agencyId)).toBe(0);
});

test("artwork Frank can't read is said for its slide, with no AI call; a client is refused", async ({ page, browser, frank }) => {
  test.setTimeout(90_000);
  await admin.from("creatives").update({ slide_text: ["We spot the problem"] }).eq("id", frank.creativeId);
  // An asset row with no file behind it: nothing to send.
  await frank.createArtworkVersion(frank.creativeId, 1, "missing.png");
  await frank.loginAsStaff(page);
  await openChecks(page, frank.creativeId);
  await page.getByRole("button", { name: "Check Creative" }).click();
  const finding = page.locator(".checkfind.warn", { hasText: "Image 1" });
  await expect(finding).toContainText("Frank couldn't read this image's artwork", { timeout: 15_000 });
  expect(await usage(frank.agencyId)).toBe(0);

  // And the team only: a client, signed in, is refused.
  const ctx = await browser.newContext();
  const cp = await ctx.newPage();
  await frank.loginAsClient(cp);
  const res = await cp.request.post(`${APP_URL}/api/ai/check-creative`, { data: { creativeId: frank.creativeId } });
  expect(res.status()).toBe(403);
  await ctx.close();
});
