import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";
import { monthSection, monthSource, overviewHash, sectionSource } from "../../lib/strategy-overview";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
// A client's page shows the brand at a glance (direct instruction): Tone of
// Voice, Target Audience and Prioritised Features from its Knowledge, cut
// short, See All opening that area in Discovery; a client's own people see
// it too, without the way to add.
test("a client's page shows the brand from its Knowledge, See All opening it", async ({ page, browser, frank }) => {
  test.setTimeout(120_000);
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  const add = (section: string, title: string, body: string) => admin.from("knowledge_entries").insert({ agency_id: frank.agencyId, client_id: frank.clientId, section, kind: "text", title, body, author_id: staffId });
  await add("tone", "What, How, Focus", "Warm, direct and a little cheeky. We talk like a smart friend, never like a brochure. Short sentences. No jargon, no exclamation marks. We focus on what the reader gets, not what we do.\nAlways lead with the benefit.");
  for (const t of ["SME Business Owners (30-60s)", "Brand Managers (25-45)", "Marketing Personnel (22-55+)", "C-Level Executives (40-65+)", "Key Decision Makers (30-65+)"]) await add("audience", t, "Busy people who want results they can see, explained simply, with proof.");
  await frank.loginAsStaff(page);
  // No overview written (never a live AI call in a test): the first entry.
  await page.route("**/api/ai/strategy-overview", (r) => r.fulfill({ status: 502, json: { error: "Not in tests" } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(APP_URL + "/clients/" + frank.clientId);
  await expect(page.locator(".brandrem-box", { hasText: "Tone of Voice" })).toContainText("Warm, direct", { timeout: 20_000 });
  await expect(page.locator(".brandrem-box", { hasText: "Target Audience" })).toContainText("Also: Brand Managers (25-45)");
  await expect(page.locator(".brandrem-box", { hasText: "Target Audience" })).toContainText("1 more");
  await expect(page.locator(".brandrem-box", { hasText: "Prioritised Features" }).getByRole("link", { name: "Add it in Discovery" })).toBeVisible();
  await page.locator(".brandrem-box", { hasText: "Target Audience" }).getByRole("link", { name: "See All" }).click();
  await page.waitForURL("**/settings/knowledge#kb-audience");
  await expect(page.getByRole("heading", { name: "Discovery" })).toBeVisible();
  await expect(page.locator("#kb-audience")).toBeInViewport();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const c = await ctx.newPage();
  await frank.loginAsClient(c);
  await c.goto(APP_URL + "/clients/" + frank.clientId);
  await expect(c.locator(".brandrem-box", { hasText: "Prioritised Features" })).toContainText("Nothing here yet.", { timeout: 20_000 });
  await expect(c.locator(".brandrem-box", { hasText: "Prioritised Features" }).getByRole("link")).toHaveCount(0);
  await ctx.close();
});

// The projects' order, in place of searching them (direct instruction):
// Latest activity, A–Z, Recently added or Deadline, remembered.
test("a client's projects sort by latest activity, name, when added or deadline", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const mk = async (name: string, ago: number) => (await admin.from("projects").insert({ client_id: frank.clientId, name, delivery: "continuous", created_at: new Date(Date.now() - ago * 864e5).toISOString() }).select("id").single()).data!.id;
  await mk("Alpha Old", 30); await mk("Zulu New", 1); await mk("Middle", 10);
  await admin.from("projects").update({ created_at: new Date(Date.now() - 60 * 864e5).toISOString() }).eq("id", frank.projectId);
  await frank.loginAsStaff(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(APP_URL + "/clients/" + frank.clientId);
  await expect(page.locator(".crow", { hasText: "Zulu New" })).toBeVisible({ timeout: 20_000 });
  // Each row's name is its first line (projects have no pictures now).
  const expectOrder = async (label: string, names: string[]) => {
    await page.getByLabel("Sort projects").selectOption({ label });
    await expect
      .poll(async () => (await page.locator(".crow:not(.head)").allInnerTexts()).map((t) => t.split("\n")[0]))
      .toEqual(names);
  };
  // The fixture's project has a post, so it's the latest; then newest made.
  await expectOrder("Latest activity", ["E2E Test Project", "Zulu New", "Middle", "Alpha Old"]);
  await expectOrder("A–Z", ["Alpha Old", "E2E Test Project", "Middle", "Zulu New"]);
  await expectOrder("Recently added", ["Zulu New", "Middle", "Alpha Old", "E2E Test Project"]);
  await page.getByLabel("Sort projects").selectOption({ label: "A–Z" });
  await page.reload();
  await expect(page.locator(".crow", { hasText: "Zulu New" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("Sort projects")).toHaveValue("name");
});

// A client's monthly strategy (phase78, direct instruction): written by the
// team in Client Settings → Knowledge → Strategy, shown as this month's box
// on the client's page, read only for the client's own people.
test("the team writes a month's strategy, the client's page shows it, a Client reads it", async ({ page, browser, frank }) => {
  test.setTimeout(120_000);
  await frank.loginAsStaff(page);
  await page.route("**/api/ai/strategy-overview", (r) => r.fulfill({ status: 502, json: { error: "Not in tests" } }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(APP_URL + "/clients/" + frank.clientId + "/settings/strategy");
  // Months are added (phase79); this month is the first offered.
  await expect(page.getByText("No months yet")).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Add Month").selectOption({ index: 1 });
  const now = page.locator(".strat", { hasText: "This month" });
  await expect(now.getByLabel("Objective")).toBeVisible({ timeout: 20_000 });
  await now.getByLabel("Objective").fill("Launch the new range to SME owners");
  await now.getByLabel("Key messages").fill("Faster approvals, fewer meetings");
  await now.getByLabel("Offers and promotions").fill("20% off the first month");
  await now.getByRole("button", { name: /^Save / }).click();
  await expect(now.getByRole("button", { name: "Saved" })).toBeVisible({ timeout: 15_000 });
  await expect(now).toContainText("3 of 6 filled");
  await page.goto(APP_URL + "/clients/" + frank.clientId);
  await expect(page.locator(".brandrem-box").nth(3)).toContainText("Launch the new range", { timeout: 20_000 });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const c = await ctx.newPage();
  await frank.loginAsClient(c);
  await c.goto(APP_URL + "/clients/" + frank.clientId + "/settings/strategy");
  await expect(c.locator(".strat", { hasText: "This month" })).toContainText("Launch the new range", { timeout: 20_000 });
  await expect(c.locator(".strat textarea")).toHaveCount(0);
  await ctx.close();
});

// Archiving a month only tidies the list (phase79, decided directly): it
// moves to Archived and can come back; Add Month no longer offers it.
test("a month is archived to its own list and brought back", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await frank.loginAsStaff(page);
  await page.goto(APP_URL + "/clients/" + frank.clientId + "/settings/strategy");
  const add = page.getByLabel("Add Month");
  await expect(page.getByText("No months yet")).toBeVisible({ timeout: 20_000 });
  await add.selectOption({ index: 1 });
  await expect(page.locator(".strat")).toHaveCount(1, { timeout: 15_000 });
  await add.selectOption({ index: 1 });
  await expect(page.getByRole("button", { name: "Active (2)" })).toBeVisible({ timeout: 15_000 });
  const second = page.locator(".strat").nth(1);
  const name = await second.locator(".strat-h b").innerText();
  await second.locator(".strat-h").click();
  await second.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByRole("button", { name: "Archived (1)" })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".strat .strat-h b")).not.toContainText([name]);
  await expect(add.locator("option", { hasText: name })).toHaveCount(0);
  await page.getByRole("button", { name: "Archived (1)" }).click();
  await expect(page.locator(".strat .strat-h b")).toHaveText([name]);
  await page.locator(".strat .strat-h").click();
  await page.getByRole("button", { name: "Unarchive" }).click();
  await expect(page.getByRole("button", { name: "Active (2)" })).toBeVisible({ timeout: 15_000 });
});

// Each box is Frank's overview of everything in it (phase83, decided
// directly), written when what it's from changes, the first time the team
// opens the client after that. Seeded here, never written live in a test.
test("the boxes show their overviews, and only a changed one is asked for again", async ({ page, browser, frank }) => {
  test.setTimeout(120_000);
  const entry = { agency_id: frank.agencyId, client_id: frank.clientId, kind: "text" };
  await admin.from("knowledge_entries").insert([
    { ...entry, section: "tone", title: "Voice", body: "Warm and plain." },
    { ...entry, section: "audience", title: "Primary", body: "Home cooks in Mumbai." },
  ]);
  const month = new Date().toISOString().slice(0, 7) + "-01";
  const strategy = { objective: "Sell the Diwali hamper", key_messages: "Order by 25 October" };
  await admin.from("client_monthly_strategies").insert({ agency_id: frank.agencyId, client_id: frank.clientId, month, ...strategy });
  const tone = sectionSource([{ kind: "text", title: "Voice", body: "Warm and plain." }]);
  const ms = monthSource(strategy);
  await admin.from("client_strategy_overviews").insert([
    { client_id: frank.clientId, section: "tone", overview: "Overview of the voice, up to date.\n\nA second paragraph about it.", source_hash: overviewHash(tone) },
    // Written before the audience last changed.
    { client_id: frank.clientId, section: "audience", overview: "An older overview of the audience.", source_hash: "00000000" },
    { client_id: frank.clientId, section: monthSection(month), overview: "Overview of this month, up to date.", source_hash: overviewHash(ms) },
  ]);

  const asked: string[] = [];
  await page.route("**/api/ai/strategy-overview", async (r) => {
    asked.push(JSON.parse(r.request().postData() ?? "{}").section);
    await r.fulfill({ status: 502, json: { error: "Not in tests" } });
  });
  await frank.loginAsStaff(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(APP_URL + "/clients/" + frank.clientId);
  // The stage counts went for the boxes.
  await expect(page.locator(".stats")).toHaveCount(0);
  await expect(page.locator(".brandrem-box", { hasText: "Tone of Voice" })).toContainText("Overview of the voice, up to date.", { timeout: 20_000 });
  await expect(page.locator(".brandrem-box").nth(3)).toContainText("Overview of this month, up to date.");
  // Named for its month, here only (direct instruction).
  await expect(page.locator(".brandrem-box").nth(3).locator(".brandrem-h b").first()).toHaveText(/^[A-Z][a-z]{2} \d{4} Strategy$/);
  await expect(page.getByRole("heading", { name: "Strategy Overview" })).toBeVisible();
  // In its paragraphs, and in full on hover.
  const toneBox = page.locator(".brandrem-box", { hasText: "Tone of Voice" });
  await expect(toneBox.locator(".brandrem-ov").first().locator("p")).toHaveText(["Overview of the voice, up to date.", "A second paragraph about it."]);
  await expect(toneBox.locator(".brandrem-full")).toHaveCSS("opacity", "0");
  await toneBox.hover();
  await expect(toneBox.locator(".brandrem-full")).toHaveCSS("opacity", "1");
  // The out-of-date one stays up while Frank is asked for a new one.
  await expect(page.locator(".brandrem-box", { hasText: "Target Audience" })).toContainText("An older overview of the audience.");
  await expect.poll(() => asked).toEqual(["audience"]);

  // A Client sees them, and never asks.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const c = await ctx.newPage();
  let clientAsked = 0;
  await c.route("**/api/ai/strategy-overview", (r) => {
    clientAsked++;
    return r.fulfill({ status: 502, json: {} });
  });
  await frank.loginAsClient(c);
  await c.goto(APP_URL + "/clients/" + frank.clientId);
  await expect(c.locator(".brandrem-box", { hasText: "Tone of Voice" })).toContainText("Overview of the voice, up to date.", { timeout: 20_000 });
  await c.waitForTimeout(1500);
  expect(clientAsked).toBe(0);
  // And can't write one, nor call the route (it's the team's).
  const cs = await ctx.request.post(APP_URL + "/api/ai/strategy-overview", { data: { clientId: frank.clientId, section: "tone" } });
  expect(cs.status()).toBe(403);
  await ctx.close();
});
