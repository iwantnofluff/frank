import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { test, expect, APP_URL } from "./fixtures";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Two people with one post's Edit window open (phase82, direct instruction):
// the second save stops, says who changed what, and Keep Theirs takes only
// their change; Text on Image the same.
test("two people saving one post: the second is asked, and nothing is lost", async ({ page, browser, frank }) => {
  test.setTimeout(150_000);
  const email = "e2e-member-" + Date.now() + "@example.invalid";
  const password = "E2e-Second-Test-1234!";
  const { data: u } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const otherId = u.user!.id;
  await admin.from("users").insert({ id: otherId, email, name: "Raj Second" });
  const { data: m } = await admin.from("memberships").insert({ agency_id: frank.agencyId, user_id: otherId, role: "admin", accepted_at: new Date().toISOString() }).select("id").single();
  const openBrief = async (p: Page) => {
    await p.goto(APP_URL + "/creatives/" + frank.creativeId);
    await p.getByRole("button", { name: "Edit", exact: true }).click();
    await p.getByRole("tab", { name: "Brief" }).click();
    await expect(p.locator("#nbName")).toBeVisible({ timeout: 15_000 });
  };
  try {
    await frank.loginAsStaff(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await openBrief(page);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const b = await ctx.newPage();
    await b.goto(APP_URL + "/login");
    await b.fill('input[type="email"]', email);
    await b.fill('input[type="password"]', password);
    await b.click('button[type="submit"]');
    await b.waitForURL("**/dashboard");
    await openBrief(b);
    await b.locator("#nbConcept").fill("Raj's new concept");
    await b.getByRole("button", { name: "Update" }).click();
    await expect(b.getByText("Updated").first()).toBeVisible({ timeout: 15_000 }).catch(() => {});
    await b.waitForTimeout(1500);
    // The first person, still on the old version, saves a different change.
    await page.locator("#nbName").fill("Renamed by staff");
    await page.getByRole("button", { name: "Update" }).click();
    const clash = page.getByRole("dialog", { name: "Changed While You Were Editing" });
    await expect(clash).toBeVisible({ timeout: 15_000 });
    await expect(clash).toContainText("Raj Second saved this post");
    await expect(clash.locator(".confirm-list")).toHaveText("Concept");
    const { data: mid } = await admin.from("creatives").select("name, concept").eq("id", frank.creativeId).single();
    expect(mid).toEqual({ name: "E2E Test Creative", concept: "Raj's new concept" });
    await clash.getByRole("button", { name: "Keep Theirs" }).click();
    await expect(page.locator("#nbConcept")).toHaveValue("Raj's new concept");
    await expect(page.locator("#nbName")).toHaveValue("Renamed by staff");
    await page.getByRole("button", { name: "Update" }).click();
    await page.waitForTimeout(2500);
    const { data: end } = await admin.from("creatives").select("name, concept").eq("id", frank.creativeId).single();
    expect(end).toEqual({ name: "Renamed by staff", concept: "Raj's new concept" });
    await expect(clash).toHaveCount(0);
    // Text on Image: Raj saves it, then the first person (window still
    // open from before) saves different text.
    const openContent = async (p: Page) => {
      await p.goto(APP_URL + "/creatives/" + frank.creativeId);
      await p.getByRole("button", { name: "Edit", exact: true }).click();
      await p.getByRole("tab", { name: "Content" }).click();
      await expect(p.locator(".msection-h", { hasText: "Text on Image" }).locator("xpath=following::*[self::textarea or self::input][1]")).toBeVisible({ timeout: 15_000 });
    };
    await openContent(page);
    await openContent(b);
    await b.locator(".msection-h", { hasText: "Text on Image" }).locator("xpath=following::*[self::textarea or self::input][1]").fill("Raj's words");
    await b.getByRole("button", { name: "Save Text on Image" }).click();
    await b.waitForTimeout(2000);
    await page.locator(".msection-h", { hasText: "Text on Image" }).locator("xpath=following::*[self::textarea or self::input][1]").fill("Staff words");
    await page.getByRole("button", { name: "Save Text on Image" }).click();
    await expect(page.getByText("changed the Text on Image while you had it open")).toBeVisible({ timeout: 15_000 });
    expect((await admin.from("creatives").select("slide_text").eq("id", frank.creativeId).single()).data).toEqual({ slide_text: ["Raj's words"] });
    await page.getByRole("button", { name: "Show Theirs" }).click();
    await expect(page.locator(".msection-h", { hasText: "Text on Image" }).locator("xpath=following::*[self::textarea or self::input][1]")).toHaveValue("Raj's words");
    await ctx.close();
  } finally {
    await admin.from("memberships").delete().eq("id", m!.id);
    await admin.from("users").delete().eq("id", otherId);
    await admin.auth.admin.deleteUser(otherId);
  }
});

// Who else is here (phase82, direct instruction): the project's table and
// its posts show the team members there and anyone editing; an edit shows
// on others' pages at once; leaving clears it.
test("the team sees who's on a project and post, and who's editing", async ({ page, browser, frank }) => {
  test.setTimeout(150_000);
  const email = "e2e-member-" + Date.now() + "@example.invalid";
  const password = "E2e-Second-Test-1234!";
  const { data: u } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const otherId = u.user!.id;
  await admin.from("users").insert({ id: otherId, email, name: "Raj Second" });
  const { data: m } = await admin.from("memberships").insert({ agency_id: frank.agencyId, user_id: otherId, role: "admin", accepted_at: new Date().toISOString() }).select("id").single();
  try {
    await frank.loginAsStaff(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(APP_URL + "/projects/" + frank.projectId);
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const b = await ctx.newPage();
    await b.goto(APP_URL + "/login");
    await b.fill('input[type="email"]', email);
    await b.fill('input[type="password"]', password);
    await b.click('button[type="submit"]');
    await b.waitForURL("**/dashboard");
    await b.goto(APP_URL + "/creatives/" + frank.creativeId);
    const av = page.locator(".presence .presence-p");
    await expect(av).toHaveCount(1, { timeout: 20_000 });
    await expect(av).toHaveAttribute("title", "Raj Second, on E2E Test Creative");
    await b.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.locator(".presence-p.editing")).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator(".presence .presence-p")).toHaveAttribute("title", "Raj Second, editing E2E Test Creative");
    // The staff member goes to the post; Raj renames it in his open window,
    // and it shows here without a reload.
    await page.goto(APP_URL + "/creatives/" + frank.creativeId);
    await expect(page.locator(".presence-note")).toBeVisible({ timeout: 20_000 });
    await b.getByRole("tab", { name: "Brief" }).click();
    await b.locator("#nbName").fill("Renamed live by Raj");
    await b.getByRole("button", { name: "Update" }).click();
    await expect(page.getByText("Renamed live by Raj").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".presence-note")).toContainText("Raj Second is editing", { timeout: 20_000 });
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.locator(".presence-banner")).toContainText("Raj Second is editing this post too", { timeout: 15_000 });
    await ctx.close();
    await expect(page.locator(".presence-banner")).toHaveCount(0, { timeout: 20_000 });
  } finally {
    await admin.from("memberships").delete().eq("id", m!.id);
    await admin.from("users").delete().eq("id", otherId);
    await admin.auth.admin.deleteUser(otherId);
  }
});
