import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";

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

// Help's Show Me (phase147, direct instruction): under a topic's text and
// on a category, the team's walkthrough of it on the sample client, Help
// out of the way while it runs, any window it opened closed after.
test("Show Me under a Help topic walks from Clients to it on the sample client, and Help comes back where it was", async ({ page, frank }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await frank.loginAsStaff(page);
  await page.getByRole("button", { name: "Ask Frank", exact: true }).click();
  const help = page.locator(".helppanel");
  await help.getByPlaceholder("Search topics").fill("send posts");
  await help.getByRole("button", { name: /Send Posts to Your Client for Review/ }).click();
  await help.getByRole("button", { name: "Show me Send Posts to Your Client for Review" }).click();
  // Out of sight while it runs, not closed.
  await expect(help).toBeHidden();
  const card = page.locator(".tour-card");
  // From Clients, every click on the way (direct instruction).
  const titles = ["Open a client", "Open a project", "Open a post", "Share for review", "What the link shows"];
  for (let i = 0; i < titles.length; i++) {
    await expect(card.locator(".tour-n")).toHaveText(`${i + 1} of ${titles.length}`, { timeout: 60_000 });
    await expect(card.locator("h2")).toHaveText(titles[i]);
    if (i === 0) await expect(page.locator(".tour-hole")).toBeVisible();
    if (i === 4) await expect(page.locator(".modal")).toBeVisible();
    await card.getByRole("button", { name: i === titles.length - 1 ? "Done" : "Next" }).click();
  }
  await expect(page.locator(".tour")).toHaveCount(0);
  await expect(page.locator(".modal")).toHaveCount(0);
  // Back on the same topic.
  await expect(help).toBeVisible();
  await expect(help.locator(".help-title")).toHaveText("Send Posts to Your Client for Review");

  // A category: its topics' walkthroughs, one count across them.
  await page.reload();
  await page.getByRole("button", { name: "Ask Frank", exact: true }).click();
  await help.getByRole("button", { name: /^Reviews and Approvals/ }).click();
  await help.getByRole("button", { name: "Show me Reviews and Approvals" }).click();
  await expect(card.locator(".tour-n")).toHaveText(/^1 of \d+$/, { timeout: 60_000 });
  await page.keyboard.press("Escape");
  await expect(page.locator(".tour")).toHaveCount(0);
  await expect(help.locator(".help-title")).toHaveText("Reviews and Approvals");
});

test("a link in Help goes to that page, Help staying open where it was", async ({ page, frank }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await frank.loginAsStaff(page);
  // In a client: its own page.
  await page.goto(`${APP_URL}/clients/${frank.clientId}`);
  await page.getByRole("button", { name: "Ask Frank", exact: true }).click();
  const help = page.locator(".helppanel");
  await help.getByPlaceholder("Search topics").fill("client settings");
  await help.getByRole("button", { name: /^Client Settings/ }).click();
  await help.getByRole("link", { name: "Knowledge → Discovery" }).first().click();
  await page.waitForURL(`**/clients/${frank.clientId}/settings/knowledge`);
  await expect(help).toBeVisible();
  await expect(help.locator(".help-title")).toHaveText("Client Settings");
});

test("a client reviewer's Help has no Show Me", async ({ page, frank }) => {
  await frank.loginAsClient(page);
  await page.getByRole("button", { name: "Ask Frank", exact: true }).click();
  const help = page.getByRole("complementary", { name: "Ask Frank" });
  await help.getByRole("button", { name: /^Reviews and Approvals/ }).click();
  await expect(help.getByRole("heading", { name: "Reviews and Approvals" })).toBeVisible();
  await expect(help.getByRole("button", { name: /^Show me/ })).toHaveCount(0);
});
