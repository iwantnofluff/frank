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
  await row.getByLabel("Post type").selectOption({ label: "Instagram Carousel" });
  await row.getByLabel("Concept").fill("Five slides on the new menu.");
  await bar.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("tr.draft")).toHaveCount(0);

  // Lands on the post's own month, like the window does.
  await expect(page.locator(".calmonth")).toHaveText("March 2027");
  await expect(page.locator(".pname", { hasText: "Quick Row E2E" })).toBeVisible();
  const { data: c } = await admin
    .from("creatives")
    .select("format, concept, scheduled_at, stage")
    .eq("project_id", frank.projectId)
    .eq("name", "Quick Row E2E")
    .single();
  expect(c!.format).toBe("ig_carousel");
  expect(c!.concept).toBe("Five slides on the new menu.");
  expect(c!.stage).toBe(1);
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
  await bar.getByRole("button", { name: "Save" }).click();
  await expect(bar).toContainText("Say where this goes");
  await row.getByLabel("Destination").fill("Amazon listing — hero image");
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
  expect(c).toEqual({ destination: "Amazon listing — hero image", due_on: "2027-03-18" });
});
