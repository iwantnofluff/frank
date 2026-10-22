import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { test, expect, APP_URL } from "./fixtures";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function openRow(page: Page) {
  await page.getByRole("button", { name: "How to add it" }).click();
  await page.getByRole("menuitem", { name: /^Row/ }).click();
  await expect(page.locator("tr.draft")).toBeVisible();
}

test("a Content Planner post can be added straight into the table", async ({ page, frank }) => {
  test.setTimeout(60_000);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");

  // Cancel leaves nothing behind.
  await openRow(page);
  await page.getByRole("region", { name: "New post row" }).getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator("tr.draft")).toHaveCount(0);

  await openRow(page);
  const bar = page.getByRole("region", { name: "New post row" });
  // The selection bar's look, above the table (direct instruction).
  await expect(bar).toHaveClass(/selectionbar/);
  await expect(bar).toContainText("1 added");
  await bar.getByRole("button", { name: "Save" }).click();
  await expect(bar).toContainText("Give the post a name");

  const row = page.locator("tr.draft");
  await row.getByLabel("Post name").fill("Quick Row E2E");
  await row.getByLabel("Date").fill("2027-03-20");
  await row.getByLabel("Time").fill("14:30");
  // The status shows as the pill it'll get (direct instruction).
  await expect(row.locator(".stg")).toHaveText(/^1\.\s*Concept$/);
  await row.getByLabel("Post type").selectOption({ label: "Instagram Carousel" });
  await row.getByLabel("Concept").fill("Five slides on the new menu.");
  // A written Concept waits to be approved (phase115): still Concept.
  await expect(row.locator(".stg")).toHaveText(/^1\.\s*Concept$/);
  // Every column the window can fill is open here too (direct
  // instruction): Slides, Caption, Alt Text, Notes for Designer; Text on
  // Image stays in the post for several slides.
  await row.getByLabel("Slides").selectOption("5");
  await expect(row).toContainText("In the post, by slide");
  await row.getByLabel("Caption").fill("The autumn menu is here.");
  // Copy moves it on to Internal Review, as saving copy does.
  await expect(row.locator(".stg")).toHaveText(/^3\.\s*Internal Review$/);
  await row.getByLabel("Alt Text").fill("Five drinks on a table.");
  await row.getByLabel("Notes for Designer").fill("Warm, one hero per slide.");
  await bar.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("tr.draft")).toHaveCount(0);

  // Lands on the post's own month, like the window does.
  await expect(page.locator(".calmonth")).toHaveText("March 2027");
  await expect(page.locator(".pname", { hasText: "Quick Row E2E" })).toBeVisible();
  const { data: c } = await admin
    .from("creatives")
    .select("id, format, concept, scheduled_at, stage, slide_count")
    .eq("project_id", frank.projectId)
    .eq("name", "Quick Row E2E")
    .single();
  expect(c!.format).toBe("ig_carousel");
  expect(c!.concept).toBe("Five slides on the new menu.");
  expect(c!.slide_count).toBe(5);
  const { data: copy } = await admin.from("copy_versions").select("version_no, fields").eq("creative_id", c!.id);
  expect(copy).toEqual([{ version_no: 1, fields: { caption: "The autumn menu is here.", alt: "Five drinks on a table." } }]);
  const { data: notes } = await admin.from("designer_notes").select("overall").eq("creative_id", c!.id).single();
  expect(notes!.overall).toBe("Warm, one hero per slide.");
  // Its copy is written, so it's in Internal Review already, as the row's
  // pill said.
  expect(c!.stage).toBe(3);
  const when = new Date(c!.scheduled_at);
  expect([when.getFullYear(), when.getMonth(), when.getDate(), when.getHours(), when.getMinutes()]).toEqual([
    2027, 2, 20, 14, 30,
  ]);
});

test("an Other Content post can be added straight into an empty table", async ({ page, frank }) => {
  test.setTimeout(60_000);
  const { data: proj } = await admin
    .from("projects")
    .insert({ client_id: frank.clientId, name: "Empty Continuous E2E", delivery: "continuous" })
    .select("id")
    .single();
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/projects/${proj!.id}`);
  await expect(page.getByText("No creatives yet")).toBeVisible();

  await openRow(page);
  const row = page.locator("tr.draft");
  const bar = page.getByRole("region", { name: "New post row" });
  await row.getByLabel("Post name").fill("Listing Refresh E2E");
  // No Destination any more (direct instruction): a name and date will do.
  await expect(row.getByLabel("Destination")).toHaveCount(0);
  await row.getByLabel("Date").fill("2027-03-18");
  await bar.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("tr.draft")).toHaveCount(0);
  await expect(page.locator(".pname", { hasText: "Listing Refresh E2E" })).toBeVisible();

  const { data: c } = await admin
    .from("creatives")
    .select("destination, due_on")
    .eq("project_id", proj!.id)
    .eq("name", "Listing Refresh E2E")
    .single();
  expect(c).toEqual({ destination: null, due_on: "2027-03-18" });
});
