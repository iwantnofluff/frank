import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";

// Check Design (direct instruction): the latest artwork's logo size and
// position and fonts against the client's last 10 Approved or Live posts,
// and its visual hierarchy. A live AI answer is checked by hand, never
// here: these cover what's decided before any AI call, and the findings box
// with the AI's answer seeded.
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

test("Check Design waits for artwork, needs a Claude model, and is the team's only", async ({ page, browser, frank }) => {
  test.setTimeout(90_000);
  await frank.loginAsStaff(page);
  await openChecks(page, frank.creativeId);
  const button = page.getByRole("button", { name: "Check Design" });
  await expect(button).toBeDisabled();
  await expect(page.getByText("Upload the artwork first, then check its design.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  // No Text on Image needed, unlike Check Creative.
  await admin.from("agencies").update({ ai_default_model: "gpt-4.1" }).eq("id", frank.agencyId);
  await frank.createArtworkVersion(frank.creativeId, 1, "art.png");
  await openChecks(page, frank.creativeId);
  await button.click();
  await expect(page.getByText(/Check Design reads the artwork, which needs a Claude model\./)).toBeVisible({ timeout: 15_000 });
  expect(await usage(frank.agencyId)).toBe(0);

  const ctx = await browser.newContext();
  const cp = await ctx.newPage();
  await frank.loginAsClient(cp);
  const res = await cp.request.post(`${APP_URL}/api/ai/check-design`, { data: { creativeId: frank.creativeId } });
  expect(res.status()).toBe(403);
  await ctx.close();
});

test("artwork Frank can't read is said, with no AI call", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await admin.from("agencies").update({ ai_default_model: "claude-sonnet-5" }).eq("id", frank.agencyId);
  // An asset row with no file behind it.
  await frank.createArtworkVersion(frank.creativeId, 1, "missing.png");
  await frank.loginAsStaff(page);
  await openChecks(page, frank.creativeId);
  await page.getByRole("button", { name: "Check Design" }).click();
  await expect(page.getByText(/Frank couldn't read this post's artwork/)).toBeVisible({ timeout: 15_000 });
  expect(await usage(frank.agencyId)).toBe(0);
});

test("the design findings are acknowledged, and Add To Comments posts them as one team-only comment", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await frank.createArtworkVersion(frank.creativeId, 1, "art.png");
  // The AI's answer seeded, never asked for here.
  await page.route("**/api/ai/check-design", (route) =>
    route.fulfill({
      json: {
        compared: 10,
        findings: [
          { tone: "warn", title: "Logo Size", body: "The logo is about twice the size it is on the earlier posts." },
          { tone: "ok", title: "Logo Position", body: "Top left, as usual." },
          { tone: "warn", title: "Fonts", body: "The headline is a serif; the brand uses Helvetica." },
          { tone: "ok", title: "Visual Hierarchy", body: "Clear." },
        ],
      },
    }),
  );
  await frank.loginAsStaff(page);
  await openChecks(page, frank.creativeId);
  await page.getByRole("button", { name: "Check Design" }).click();
  const box = page.getByRole("region", { name: "Check Design findings" });
  await expect(box).toContainText("2 to look at; Logo Position, Visual Hierarchy look right");
  await expect(page.getByText("Checked the latest artwork against this client's last 10 Approved or Live posts.")).toBeVisible();
  await box.getByRole("button", { name: "Acknowledge: Fonts" }).click();
  await box.getByRole("button", { name: "Ignore: Logo Size" }).click();
  await page.getByRole("button", { name: "Add To Comments" }).click();
  await expect(box.getByText("In comments")).toBeVisible();

  const { data: rows } = await admin.from("comments").select("body, visibility").eq("creative_id", frank.creativeId);
  expect(rows).toEqual([
    { body: "Check Design: 1 thing to fix in the design. Fonts: The headline is a serif; the brand uses Helvetica.", visibility: "private" },
  ]);
});
