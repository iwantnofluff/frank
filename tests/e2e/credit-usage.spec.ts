import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL, type Frank } from "./fixtures";

// Settings → AI Governance → Credit Usage (decided directly, 2 Nov 2026):
// this month's AI requests against the allowance, by day, feature and
// person, for Owners and Admins. Usage rows aren't caller-dependent (the
// user and feature are given), so they're seeded through the service role.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function seed(frank: Frank) {
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id as string;
  const at = new Date().toISOString();
  const row = (task: string | null) => ({ agency_id: frank.agencyId, user_id: staffId, model: "claude-opus-5-5", task, created_at: at });
  const { error } = await admin
    .from("ai_usage_events")
    .insert([row("proofread"), row("proofread"), row("proofread"), row("copy_chat"), row("copy_chat"), row(null)]);
  if (error) throw error;
  const cap = (await admin.from("agencies").select("ai_monthly_request_cap").eq("id", frank.agencyId).single()).data!
    .ai_monthly_request_cap as number;
  return { cap };
}

const stat = (page: import("@playwright/test").Page, label: string) =>
  page.locator(".stat").filter({ has: page.locator(".l").getByText(label) }).locator(".n");

test("an Admin sees this month's requests against the allowance, by feature and person", async ({ page, frank }) => {
  const { cap } = await seed(frank);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/settings/ai/credit-usage`);
  await expect(stat(page, "Used this month")).toHaveText("6");
  await expect(stat(page, "Left, of")).toHaveText((cap - 6).toLocaleString("en"));
  await expect(page.getByRole("meter", { name: "Allowance used" })).toHaveAttribute("aria-valuenow", "6");
  const feature = page.locator(".an-sec").filter({ has: page.getByRole("heading", { name: "By feature" }) });
  await expect(feature.locator(".an-bar").first()).toContainText("Proofreading");
  await expect(feature.locator(".an-bar").first()).toContainText("3");
  await expect(feature.locator(".an-bar", { hasText: "Draft with Frank" })).toContainText("2");
  await expect(feature.locator(".an-bar", { hasText: "Earlier requests" })).toContainText("1");
  const person = page.locator(".an-sec").filter({ has: page.getByRole("heading", { name: "By person" }) });
  await expect(person.locator(".an-bar")).toHaveCount(1);
  await expect(person.locator(".an-bar")).toContainText("6");
  // A column for each day of the month, today's holding all six.
  const today = new Date().getUTCDate();
  await expect(page.locator(".cu-days .an-trend-col").nth(today - 1)).toHaveAttribute("title", `${today}: 6 requests`);
  // No longer Coming soon in the menu.
  await expect(page.locator(".setnav-item", { hasText: "Credit Usage" }).locator(".setnav-soon")).toHaveCount(0);
});

test("with nothing used yet, the page says so", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/settings/ai/credit-usage`);
  await expect(stat(page, "Used this month")).toHaveText("0");
  await expect(page.getByText("Nothing yet this month.")).toHaveCount(2);
});

test("a User can't see it", async ({ page, frank }) => {
  await seed(frank);
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id as string;
  await admin.from("memberships").update({ role: "user" }).eq("agency_id", frank.agencyId).eq("user_id", staffId);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/settings/ai/credit-usage`);
  await expect(page.getByText("Only Owners and Admins can see Credit Usage.")).toBeVisible();
  await expect(page.locator(".stat")).toHaveCount(0);
});

// Settings is for a computer (a phone is sent elsewhere); at its narrowest,
// the month's 30 columns still fit.
test("at Settings' narrowest, nothing is wider than the screen", async ({ page, frank }) => {
  await seed(frank);
  await page.setViewportSize({ width: 900, height: 900 });
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/settings/ai/credit-usage`);
  await expect(stat(page, "Used this month")).toHaveText("6");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
