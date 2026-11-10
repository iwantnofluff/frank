import { createClient } from "@supabase/supabase-js";
import { test, expect } from "./fixtures";

// Frank Tour (phase144, direct instruction): a guided look at the basics,
// shown once on someone's first visit and replayable from the menu. The
// page is dimmed but for one thing at a time, and takes no clicks.
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

test("someone new gets the tour on their first visit, once", async ({ page, frank }) => {
  test.setTimeout(150_000);
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  await admin.from("users").update({ tour_seen_at: null }).eq("id", staffId);
  // This browser lets it start on its own (the fixture keeps it from).
  await page.addInitScript(() => localStorage.removeItem("frank:tour-auto-off"));
  await page.setViewportSize({ width: 1440, height: 900 });
  await frank.loginAsStaff(page);
  const card = page.locator(".tour-card");
  // The workspace has no sample client: it's made, hidden, first (phase146),
  // and the tour goes through it, never the workspace's own posts.
  await expect(card.locator("h2")).toHaveText("Welcome to Frank", { timeout: 60_000 });
  const sampleId = (await admin.from("clients").select("id, archived_at").eq("agency_id", frank.agencyId).eq("is_sample", true).single()).data!.id;
  // An Admin who can't invite: no invite step; the rest, each on its page.
  const titles = ["Welcome to Frank", "Your workspace", "Add a client", "Create a project", "Add a post", "From concept to live", "You're all set"];
  for (let i = 0; i < titles.length; i++) {
    await expect(card.locator(".tour-n")).toHaveText(`${i + 1} of ${titles.length}`, { timeout: 15_000 });
    await expect(card.locator("h2")).toHaveText(titles[i]);
    if (titles[i] === "Add a client") await expect(page.locator(".tour-hole")).toBeVisible();
    if (titles[i] === "Create a project") await expect(page).toHaveURL(new RegExp(`/clients/${sampleId}`));
    if (titles[i] === "Add a post") await expect(page).not.toHaveURL(new RegExp(frank.projectId));
    if (titles[i] === "From concept to live") await expect(page).toHaveURL(/\/creatives\//);
    await card.getByRole("button", { name: i === titles.length - 1 ? "Done" : "Next" }).click();
  }
  await expect(page.locator(".tour")).toHaveCount(0);
  // Saved as seen, so it doesn't come back.
  await expect.poll(async () => (await admin.from("users").select("tour_seen_at").eq("id", staffId).single()).data!.tour_seen_at).not.toBeNull();
  await page.reload();
  await expect(page.locator(".stage")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(2000);
  await expect(page.locator(".tour")).toHaveCount(0);
});

test("Frank Tour in the menu starts it; Skip Tour or Esc ends it, and the dimmed page takes no clicks", async ({ page, frank }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await frank.loginAsStaff(page);
  for (const how of ["skip", "esc"]) {
    await page.getByRole("button", { name: "Your account" }).click();
    await page.getByRole("menuitem", { name: "Frank Tour" }).click();
    const card = page.locator(".tour-card");
    // After the sample is got ready (made, the first time).
    await expect(card.locator("h2")).toHaveText("Welcome to Frank", { timeout: 60_000 });
    // The arrow keys move through it too.
    await page.keyboard.press("ArrowRight");
    await expect(card.locator("h2")).toHaveText("Your workspace");
    await page.keyboard.press("ArrowLeft");
    await expect(card.locator("h2")).toHaveText("Welcome to Frank");
    const before = page.url();
    await page.mouse.click(300, 600);
    expect(page.url()).toBe(before);
    if (how === "skip") await page.getByRole("button", { name: "Skip Tour" }).click();
    else await page.keyboard.press("Escape");
    await expect(page.locator(".tour")).toHaveCount(0);
  }
});

test("a client gets the reviewer's tour", async ({ page, frank }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await frank.loginAsClient(page);
  await page.getByRole("button", { name: "Your account" }).click();
  await page.getByRole("menuitem", { name: "Frank Tour" }).click();
  const card = page.locator(".tour-card");
  const titles = ["Welcome to Frank", "Your work", "The post", "Comment and approve", "Notifications", "You're all set"];
  for (let i = 0; i < titles.length; i++) {
    await expect(card.locator(".tour-n")).toHaveText(`${i + 1} of ${titles.length}`, { timeout: 15_000 });
    await expect(card.locator("h2")).toHaveText(titles[i]);
    await card.getByRole("button", { name: i === titles.length - 1 ? "Done" : "Next" }).click();
  }
  await expect(page.locator(".tour")).toHaveCount(0);
});

test("on a phone there's no Frank Tour", async ({ page, frank }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await frank.loginAsStaff(page);
  await page.getByRole("button", { name: "Your account" }).click();
  await expect(page.getByRole("menuitem", { name: "My Profile" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Frank Tour" })).toHaveCount(0);
});
