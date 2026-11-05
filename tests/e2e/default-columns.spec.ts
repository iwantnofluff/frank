import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { test, expect, APP_URL } from "./fixtures";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const headerKeys = (page: Page) =>
  page.locator(".tbl thead th[data-col-key]").evaluateAll((ths) => ths.map((th) => th.getAttribute("data-col-key")));

// A new project's Main Table starts in the default order, with the
// default columns hidden (decided directly, 4 Nov 2026; phase140 set every
// existing project's to the same, and phase141 hid Slides too).
test("a new Content Planner's table starts in the default order, Slides, Alt Text and Team hidden", async ({ page, frank }) => {
  test.setTimeout(120_000);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/clients/${frank.clientId}`);
  await page.waitForSelector(".clients, .empty");
  await page.click('button:has-text("New Project")');
  await page.fill("#newName", "Default Columns Planner");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForURL(/\/projects\/.+/);
  const projectId = page.url().match(/projects\/([^/?]+)/)![1];
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  await admin.from("creatives").insert({ project_id: projectId, name: "Columns post", format: "ig_feed", formats: ["ig_feed"], stage: 1, scheduled_at: new Date().toISOString(), created_by: staffId });
  await page.reload();
  await expect(page.locator(".tbl thead")).toBeVisible({ timeout: 20_000 });
  expect(await headerKeys(page)).toEqual([
    "week", "date", "day", "time", "creative", "type", "status", "postCopy", "imageOnText", "artwork",
    "concept", "voiceover", "notes", "approach", "internalFeedback", "clientFeedback",
  ]);
});

// Other Content: Due Date (when the work is due) first, then its Publish
// Date (when it goes live, phase140), then the default columns; the rest
// hidden. The Publish Date is set from its cell, and the post window has
// both dates.
test("Other Content leads with Due Date and Publish Date, and the Publish Date can be set", async ({ page, frank }) => {
  test.setTimeout(150_000);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/clients/${frank.clientId}`);
  await page.waitForSelector(".clients, .empty");
  await page.click('button:has-text("New Project")');
  await page.click('.kopt:has-text("Other Content")');
  await page.fill("#newName", "Default Columns Other");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForURL(/\/projects\/.+/);
  const projectId = page.url().match(/projects\/([^/?]+)/)![1];
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const post = await frank.createContinuousCreative(projectId, { name: "Columns listing", dueOn: today });
  await page.reload();
  await expect(page.locator(".tbl thead")).toBeVisible({ timeout: 20_000 });
  expect(await headerKeys(page)).toEqual(["date", "publishDate", "creative", "type", "artwork", "status", "lead", "conceptRef"]);
  await expect(page.locator('.tbl thead th[data-col-key="date"]')).toContainText("Due Date");
  await expect(page.locator('.tbl thead th[data-col-key="publishDate"]')).toContainText("Publish Date");

  // No Publish Date yet: Add Date, which sets it, not the Due Date.
  const row = page.locator("tr[data-row]", { hasText: "Columns listing" });
  await row.getByTitle("Give it a Publish Date").click();
  const pop = page.getByRole("dialog", { name: "Columns listing's Publish Date" });
  await expect(pop).toBeVisible();
  // Frank's own calendar, open on this month: today, the post going live
  // the day it's due.
  const d = now;
  const label = `${d.toLocaleDateString("en-GB", { weekday: "long" })}, ${d.getDate()} ${d.toLocaleDateString("en-GB", { month: "long" })} ${d.getFullYear()}`;
  await page.locator(".caldrop").getByRole("button", { name: label }).click();
  await expect(pop.getByLabel("Publish Date")).toHaveValue(today);
  await pop.getByRole("button", { name: "Save" }).click();
  await expect(pop).toHaveCount(0);
  await expect
    .poll(async () => (await admin.from("creatives").select("due_on, publish_on").eq("id", post).single()).data, { timeout: 10_000 })
    .toEqual({ due_on: today, publish_on: today });

  // The post window has both.
  await page.goto(`${APP_URL}/creatives/${post}`);
  await expect(async () => {
    await page.getByRole("button", { name: "Edit", exact: true }).first().click();
    await expect(page.getByRole("tab", { name: "Brief" })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await page.getByRole("tab", { name: "Brief" }).click();
  await expect(page.locator('label[for="nbDue"]')).toHaveText("Due Date");
  await expect(page.locator("#nbDue")).toHaveValue(today);
  await expect(page.locator('label[for="nbPublish"]')).toHaveText("Publish Date");
  await expect(page.locator("#nbPublish")).toHaveValue(today);
});

