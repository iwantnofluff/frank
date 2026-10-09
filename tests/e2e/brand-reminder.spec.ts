import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";
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
  // Each row's name is its second line (after the avatar's initials).
  const expectOrder = async (label: string, names: string[]) => {
    await page.getByLabel("Sort projects").selectOption({ label });
    await expect
      .poll(async () => (await page.locator(".crow:not(.head)").allInnerTexts()).map((t) => t.split("\n")[1]))
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
