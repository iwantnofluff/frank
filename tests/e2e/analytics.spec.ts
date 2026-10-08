import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL, type Frank } from "./fixtures";

// Settings → Analytics (phase71, decided directly): Owners and Admins see how
// posts move from concept to approval, what holds them up and how feedback
// comes in. Stage moves are logged by a trigger; their times are set here
// to days in the past so there's something to measure.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

async function seed(frank: Frank) {
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id as string;
  const mk = async (name: string, stage: number, live: number) =>
    (await admin
      .from("creatives")
      .insert({ project_id: frank.projectId, name, format: "ig_feed", stage, created_by: staffId, lead_user_id: staffId, scheduled_at: daysAgo(-live) })
      .select("id")
      .single()).data!.id as string;
  // Approved after Concept 2 days → Internal 1 → Client 3 (changes asked once).
  const a = await mk("Analytics Approved", 1, 2);
  // In Client Review, live in 3 days: at risk.
  const b = await mk("Analytics At Risk", 3, -3);
  const moves: [string, number | null, number, string | null, number][] = [
    [a, null, 1, null, 10],
    [a, 1, 2, null, 8],
    [a, 2, 3, null, 7],
    [a, 3, 3, "changes_requested", 5],
    [a, 3, 4, null, 4],
  ];
  // Replace the trigger's own rows for A with a dated history.
  await admin.from("creative_stage_events").delete().eq("creative_id", a);
  await admin.from("creative_stage_events").insert(
    moves.map(([id, from, to, exception, ago]) => ({ agency_id: frank.agencyId, creative_id: id, from_stage: from, to_stage: to, exception, at: daysAgo(ago) })),
  );
  await admin.from("creatives").update({ stage: 4, approved_at: daysAgo(4), created_at: daysAgo(10) }).eq("id", a);
  // Two artwork versions and one copy version for A.
  await admin.from("creative_versions").insert([
    { creative_id: a, version_no: 1, created_by: staffId },
    { creative_id: a, version_no: 2, created_by: staffId },
  ]);
  await admin.from("copy_versions").insert({ creative_id: a, version_no: 1, fields: { caption: "Hi" }, source: "upload", created_by: staffId });
  // A guest's comment (the client's side), read as negative tone-and-brand,
  // and the team's own.
  await admin.from("comments").insert({
    creative_id: a, body: "This doesn't sound like us", visibility: "public", guest_name: "Priya",
    issue_category: "tone_and_brand", sentiment: "negative",
  });
  await frank.insertCommentAsStaff("Fixed the tone", "public");
  return { a, b };
}

test("an Admin sees speed, quality, feedback and the clients and people tables", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await seed(frank);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/settings/analytics`);
  await page.getByLabel("Period", { exact: true }).selectOption("all");
  const stat = (label: string) =>
    page.locator(".stat").filter({ has: page.locator(".l").getByText(label, { exact: true }) }).locator(".n");
  const section = (title: string) => page.locator(".an-sec").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  // Created 10 days ago, approved 4 days ago.
  await expect(stat("Created to approved")).toHaveText("6.0 days");
  await expect(stat("In Concept")).toHaveText("2.0 days");
  await expect(stat("In Internal Review")).toHaveText("1.0 days");
  await expect(stat("In Client Review")).toHaveText("3.0 days");
  await expect(section("Speed").locator(".an-list")).toContainText("Analytics At Risk");
  await expect(stat("Artwork versions")).toHaveText("2.0");
  await expect(stat("Approved first time")).toHaveText("0%");
  await expect(stat("From the client")).toHaveText("1");
  await expect(page.locator(".an-bar", { hasText: "Tone and Brand" })).toContainText("1");
  await expect(page.locator(".an-bar", { hasText: "Negative" })).toContainText("1");
  await expect(page.locator(".an-table").first()).toContainText("E2E Test Client");
  // Our promise: the at-risk post reached the client after its live date.
  await expect(section("Our promise").locator(".an-list")).toContainText("Analytics At Risk");
  await expect(section("Our promise").locator(".an-list")).toContainText("after going live");
  // Ball in court: it's with the client; and its live date has passed.
  await expect(section("Ball in court")).toContainText("Waiting on the client");
  await expect(section("Ball in court").locator(".an-list").last()).toContainText("Analytics At Risk");
  await expect(stat("Missed live dates")).toHaveText("1");
  // Trends: 12 weeks of columns for each measure.
  await expect(page.locator(".an-trend:not(.an-trend-axis)").first().locator(".an-trend-col")).toHaveCount(12);
  await expect(page.locator(".an-trend-axis .an-trend-wk").last()).toHaveText("This week");

  // Filters: by client, and a period with nothing in it.
  await page.getByLabel("Client", { exact: true }).selectOption({ label: "E2E Test Client" });
  await expect(stat("Created to approved")).toHaveText("6.0 days");
  await page.getByLabel("Person", { exact: true }).selectOption({ index: 0 });
  await page.getByLabel("Period", { exact: true }).selectOption("30");
  await expect(stat("Created to approved")).toHaveText("6.0 days");
});

test("the stage log is the agency's Owners' and Admins' only", async ({ frank }) => {
  await seed(frank);
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email: frank.clientEmail, password: frank.clientPassword });
  const { data } = await client.from("creative_stage_events").select("id");
  expect(data ?? []).toHaveLength(0);
  // And nobody writes to it directly.
  const staff = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await staff.auth.signInWithPassword({ email: frank.staffEmail, password: frank.staffPassword });
  const { data: wrote } = await staff
    .from("creative_stage_events")
    .insert({ agency_id: frank.agencyId, creative_id: frank.creativeId, to_stage: 4 })
    .select("id");
  expect(wrote ?? []).toHaveLength(0);
});

test("a client's promise is set in its Preferences", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/clients/${frank.clientId}/settings/preferences`);
  await page.getByLabel("Send to the client at least").selectOption("21");
  await expect
    .poll(async () => (await admin.from("client_preferences").select("lead_days").eq("client_id", frank.clientId).maybeSingle()).data?.lead_days)
    .toBe(21);
});

test("a contract's posts a month, set in Preferences, is measured against what's delivered", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await seed(frank);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/clients/${frank.clientId}/settings/preferences`);
  const box = page.getByLabel("Posts a month (contract)");
  await box.fill("12");
  await box.press("Enter");
  await expect
    .poll(async () => (await admin.from("client_preferences").select("contracted_posts_per_month").eq("client_id", frank.clientId).maybeSingle()).data?.contracted_posts_per_month)
    .toBe(12);
  await page.goto(`${APP_URL}/settings/analytics`);
  const stat = (label: string) =>
    page.locator(".stat").filter({ has: page.locator(".l").getByText(label, { exact: true }) }).locator(".n");
  // The seeded approved post goes live this month; the at-risk one is planned
  // for it too (seed's dates are days from today, both within this month).
  const thisMonth = new Date().toISOString().slice(0, 7);
  const inMonth = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 7) === thisMonth;
  test.skip(!inMonth(2) || !inMonth(-3), "the seeded live dates fall in different months today");
  await expect(stat("Approved this month")).toHaveText("1 of 12");
  await expect(stat("Planned this month")).toHaveText("2 of 12");
});
