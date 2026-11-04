import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Formats by kind of project (direct instruction): a Content Planner offers
// social and performance formats, Other Content the rest, both Other
// Creative. A post already in a format its project no longer offers keeps
// it, shown first so it can be unticked.
test("the Format picker offers the project's own formats, and keeps one a post already has", async ({ page, frank }) => {
  test.setTimeout(120_000);
  await frank.loginAsStaff(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const pop = page.getByRole("dialog", { name: "Formats" });
  const groups = () => pop.getByRole("group").evaluateAll((g) => g.map((x) => x.getAttribute("aria-label")));

  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await page.getByRole("button", { name: "New Post", exact: true }).click();
  await page.click("#nbFmt");
  await expect(pop).toBeVisible();
  expect(await groups()).toEqual(["Social — organic", "Performance marketing", "General"]);
  await page.keyboard.press("Escape");

  // An Other Content post made in Instagram Post, before the split.
  const other = await frank.createContinuousProject();
  const postId = await frank.createContinuousCreative(other, { name: "Older format post" });
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  const mem = (await admin.from("memberships").select("id").eq("user_id", staffId).eq("agency_id", frank.agencyId).single()).data!;
  await admin.from("project_access").insert({ membership_id: mem.id, project_id: other });
  await page.goto(`${APP_URL}/creatives/${postId}`);
  await expect(async () => {
    await page.getByRole("button", { name: "Edit", exact: true }).first().click();
    await expect(page.getByRole("tab", { name: "Brief" })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  await page.getByRole("tab", { name: "Brief" }).click();
  await page.click("#nbFmt");
  await expect(pop).toBeVisible();
  expect(await groups()).toEqual(["No longer offered here", "Amazon", "Email and messaging", "Web and print", "General"]);
  await expect(pop.getByRole("group", { name: "No longer offered here" }).getByRole("checkbox", { name: "Instagram Post" })).toBeChecked();
  // A planner format isn't offered to pick.
  await pop.getByPlaceholder("Find a format").fill("meta");
  await expect(pop.getByRole("checkbox")).toHaveCount(0);
});
