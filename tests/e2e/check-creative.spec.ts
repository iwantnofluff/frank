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
  const finding = page.getByRole("region", { name: "Check Creative findings" }).locator("li", { hasText: "Image 1" });
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

test("findings are acknowledged or ignored, and Add To Comments posts the acknowledged as one team-only comment", async ({ page, browser, frank }) => {
  test.setTimeout(120_000);
  await admin.from("creatives").update({ slide_text: ["We spot the problem", "Book a free call now", "Hi"] }).eq("id", frank.creativeId);
  await frank.createArtworkVersion(frank.creativeId, 1, "art.png");
  const { data: version } = await admin
    .from("creative_versions")
    .select("id")
    .eq("creative_id", frank.creativeId)
    .order("version_no", { ascending: false })
    .limit(1)
    .single();
  // The AI's answer seeded, never asked for here.
  await page.route("**/api/ai/check-creative", (route) =>
    route.fulfill({
      json: {
        findings: [
          { tone: "ok", title: "Image 1", body: "Matches." },
          { tone: "warn", title: "Image 2", body: "The artwork says BOOK A CALL TODAY; it should say Book a free call now." },
          { tone: "warn", title: "Image 3", body: "The artwork says HELLO; it should say Hi." },
        ],
      },
    }),
  );
  await frank.loginAsStaff(page);
  await openChecks(page, frank.creativeId);
  await page.getByRole("button", { name: "Check Creative" }).click();
  const box = page.getByRole("region", { name: "Check Creative findings" });
  await expect(box).toContainText("2 to look at; Image 1 matches");
  const add = page.getByRole("button", { name: "Add To Comments" });
  await expect(add).toBeDisabled();

  await box.getByRole("button", { name: "Acknowledge: Image 2" }).click();
  await expect(box.getByRole("button", { name: "Acknowledge: Image 2" })).toHaveAttribute("aria-pressed", "true");
  await box.getByRole("button", { name: "Ignore: Image 3" }).click();
  await expect(box).not.toContainText("HELLO");
  await add.click();
  await expect(page.getByText("Added to the comments, for your team only.")).toBeVisible();
  await expect(box.getByText("In comments")).toBeVisible();

  const { data: rows } = await admin
    .from("comments")
    .select("body, visibility, creative_version_id, parent_id")
    .eq("creative_id", frank.creativeId);
  expect(rows).toHaveLength(1);
  expect(rows![0].visibility).toBe("private");
  expect(rows![0].creative_version_id).toBe(version!.id);
  expect(rows![0].parent_id).toBeNull();
  expect(rows![0].body).toBe(
    "Check Creative: 1 thing to fix on the artwork. Image 2: The artwork says BOOK A CALL TODAY; it should say Book a free call now.",
  );

  // On the post's comments for the team, and not for the client.
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".cmt", { hasText: "BOOK A CALL TODAY" })).toBeVisible();
  const ctx = await browser.newContext();
  const cp = await ctx.newPage();
  await frank.loginAsClient(cp);
  await cp.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await expect(cp.locator(".cmts")).toBeVisible({ timeout: 20_000 });
  await expect(cp.getByText("BOOK A CALL TODAY")).toHaveCount(0);
  await ctx.close();
});
