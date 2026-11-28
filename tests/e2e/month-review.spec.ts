import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";

// Check the Month (phase173, direct instruction): from a post's Edit window,
// Checks, Frank's review of the direction of its month in its project. The
// last review is kept and shown (decided directly); the team's only. Never a
// live AI answer here: reviews are seeded, and the route is stubbed.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

const REVIEW = {
  verdict: "drifting",
  summary: "Leans on offers, light on the brand story.",
  strategyCovered: ["Zero sugar: post 1."],
  strategyMissing: ["Buy on Amazon: no post."],
  brandStrengths: [],
  brandGaps: ["Secondary TG unaddressed."],
  mix: ["All Instagram Posts."],
  risks: [],
  suggestions: ["Add a Reel mid-month."],
};

test("the saved review shows as it opens, says when the posts have changed, and Run Again asks again", async ({ page, frank }) => {
  test.setTimeout(120_000);
  const month = new Date().toISOString().slice(0, 8) + "01";
  await admin.from("creatives").update({ scheduled_at: `${month.slice(0, 8)}05T10:00:00Z` }).eq("id", frank.creativeId);
  const { data: post } = await admin.from("creatives").select("updated_at").eq("id", frank.creativeId).single();
  // Seeded through the team's own session (the table's policies).
  const s = anon();
  await s.auth.signInWithPassword({ email: frank.staffEmail, password: frank.staffPassword });
  const { error } = await s.from("month_reviews").insert({ project_id: frank.projectId, month, review: REVIEW, posts_at: post!.updated_at, post_count: 1 });
  expect(error).toBeNull();

  const asked: unknown[] = [];
  await page.route("**/api/ai/month-review", async (r) => {
    asked.push(r.request().postDataJSON());
    await r.fulfill({ status: 502, json: { error: "Not in tests" } });
  });
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: /^(Upload|Update) / }).first().click();
  const modal = page.locator(".scrim .modal").first();
  await modal.getByRole("tab", { name: "Checks" }).click();
  await modal.getByRole("button", { name: "Check the Month" }).click();
  const win = page.getByRole("dialog", { name: /^Check the Month: / });
  await expect(win.locator(".checkfind").first()).toContainText("Drifting");
  await expect(win).toContainText("Leans on offers, light on the brand story.");
  await expect(win.locator(".msection-h")).toHaveText(["Strategy carried", "Strategy missing", "Brand gaps", "Mix and rhythm", "Suggestions for the rest of the month"]);
  await expect(win.locator(".monthcheck-changed")).toHaveCount(0);
  // Shown, not asked for again.
  expect(asked).toEqual([]);

  // A post changed since: it says so.
  await win.getByRole("button", { name: "Done" }).click();
  await admin.from("creatives").update({ concept: "Changed after the review." }).eq("id", frank.creativeId);
  await modal.getByRole("button", { name: "Check the Month" }).click();
  await expect(win.locator(".monthcheck-changed")).toBeVisible({ timeout: 15_000 });

  // Run Again asks for this project's month.
  await win.getByRole("button", { name: "Run Again" }).click();
  await expect.poll(() => asked).toEqual([{ projectId: frank.projectId, month }]);
  await expect(win.locator(".autherr")).toContainText("Not in tests");
});

test("a client can't read a month's review or ask for one", async ({ frank }) => {
  const month = new Date().toISOString().slice(0, 8) + "01";
  const s = anon();
  await s.auth.signInWithPassword({ email: frank.staffEmail, password: frank.staffPassword });
  await s.from("month_reviews").insert({ project_id: frank.projectId, month, review: REVIEW, post_count: 0 });

  const c = anon();
  await c.auth.signInWithPassword({ email: frank.clientEmail, password: frank.clientPassword });
  const { data } = await c.from("month_reviews").select("id").eq("project_id", frank.projectId);
  expect(data).toEqual([]);
  const { error } = await c.from("month_reviews").insert({ project_id: frank.projectId, month: "2030-01-01", review: REVIEW, post_count: 0 });
  expect(error?.message).toMatch(/row-level security/);
});

// Run Again shows a new review, kept only on Save (phase174, decided
// directly); Share to Slack is greyed out with the reason until the project
// has a channel. The link from Slack opens the month's window.
test("Run Again isn't kept until Save; the Slack link opens the month's review", async ({ page, frank }) => {
  test.setTimeout(120_000);
  const month = new Date().toISOString().slice(0, 8) + "01";
  const s = anon();
  await s.auth.signInWithPassword({ email: frank.staffEmail, password: frank.staffPassword });
  await s.from("month_reviews").insert({ project_id: frank.projectId, month, review: REVIEW, post_count: 0 });
  const NEW = { ...REVIEW, verdict: "on_track", summary: "Back on track after the changes." };
  await page.route("**/api/ai/month-review", (r) =>
    r.fulfill({ json: { saved: false, row: { project_id: frank.projectId, month, review: NEW, posts_at: null, post_count: 0, updated_at: new Date().toISOString() } } }),
  );
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}?edit=checks&check=month&month=${month}`);
  const win = page.getByRole("dialog", { name: /^Check the Month: / });
  await expect(win).toContainText("Leans on offers, light on the brand story.", { timeout: 20_000 });
  await expect(win.getByRole("button", { name: "Save" })).toHaveCount(0);
  await expect(win.getByRole("button", { name: "Share to Slack" })).toBeDisabled();
  await expect(win).toContainText("Connect Slack in Workspace Settings → Connections → Slack to share checks.");

  await win.getByRole("button", { name: "Run Again" }).click();
  await expect(win).toContainText("Back on track after the changes.");
  await expect(win.locator(".monthcheck-meta")).toContainText("checked just now, not saved yet");
  // Not kept yet.
  const kept = async () => (await admin.from("month_reviews").select("review").eq("project_id", frank.projectId).eq("month", month).single()).data!.review.summary;
  expect(await kept()).toBe("Leans on offers, light on the brand story.");
  await win.getByRole("button", { name: "Save" }).click();
  await expect(win.getByRole("button", { name: "Save" })).toHaveCount(0);
  await expect.poll(kept).toBe("Back on track after the changes.");
  await expect(win.locator(".monthcheck-meta")).toContainText("saved");
});
