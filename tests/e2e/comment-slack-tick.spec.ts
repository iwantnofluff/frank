import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL, type Frank } from "./fixtures";

// The comment box's Slack tick (phase162, direct instruction): for the team,
// when the project has a Slack channel, ticked whenever the project's
// settings would send the comment; unticked, the comment stays out of
// Slack. A client has none. Checked against Slack's queue (slack_outbox),
// not Slack itself: the posting is slack.spec's.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function connect(frank: Frank, includePrivate: boolean) {
  const c = await admin
    .from("slack_connections")
    .insert({ agency_id: frank.agencyId, team_id: "T_E2E", team_name: "E2E Slack", bot_token_enc: "not-a-real-token" });
  if (c.error) throw new Error(c.error.message);
  const p = await admin.from("project_slack").insert({
    project_id: frank.projectId,
    channel_id: "C_E2E",
    channel_name: "e2e-social",
    client_activity: true,
    team_comments: true,
    include_private: includePrivate,
  });
  if (p.error) throw new Error(p.error.message);
}

const queued = async (frank: Frank, body: string) => {
  const { data: c } = await admin.from("comments").select("id, send_to_slack").eq("creative_id", frank.creativeId).eq("body", body).maybeSingle();
  if (!c) return null;
  const { data: rows } = await admin.from("slack_outbox").select("id").eq("comment_id", c.id);
  return { sendToSlack: c.send_to_slack as boolean, queued: (rows ?? []).length };
};

test("the team's Slack tick sends a comment, or keeps it out", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await connect(frank, false);
  await frank.loginAsStaff(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const box = page.locator("aside.cmts > .composer");
  const tick = box.getByRole("checkbox", { name: "Slack" });
  const privateTick = box.getByRole("checkbox", { name: "Private" });

  // Private, and the project doesn't send Private ones: no tick.
  await expect(privateTick).toBeChecked();
  await expect(tick).toHaveCount(0);
  // Public: ticked, in the one row with Post at its end.
  await privateTick.uncheck();
  await expect(tick).toBeChecked();
  await expect(box.locator(".cf.opts")).toHaveCount(1);
  await expect(box.locator(".cf.opts").getByRole("button", { name: "Post" })).toBeVisible();

  await page.getByPlaceholder("Add a comment…").fill("Goes to Slack");
  await box.getByRole("button", { name: "Post" }).click();
  await expect.poll(() => queued(frank, "Goes to Slack")).toEqual({ sendToSlack: true, queued: 1 });

  // Ticked again for the next; unticked, it stays out.
  await privateTick.uncheck();
  await expect(tick).toBeChecked();
  await tick.uncheck();
  await page.getByPlaceholder("Add a comment…").fill("Kept out of Slack");
  await box.getByRole("button", { name: "Post" }).click();
  await expect.poll(() => queued(frank, "Kept out of Slack")).toEqual({ sendToSlack: false, queued: 0 });

  // A reply has the tick too.
  const card = page.locator(".cmt", { hasText: "Goes to Slack" });
  await card.getByRole("button", { name: "Reply" }).click();
  const replyBox = card.locator(".replybox .composer");
  await replyBox.getByRole("checkbox", { name: "Private" }).uncheck();
  await replyBox.getByRole("checkbox", { name: "Slack" }).uncheck();
  await replyBox.locator("textarea").fill("A reply kept out");
  await replyBox.getByRole("button", { name: "Reply" }).click();
  await expect.poll(() => queued(frank, "A reply kept out")).toEqual({ sendToSlack: false, queued: 0 });
});

test("a client has no Slack tick, and nor does a project without a channel", async ({ page, browser, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await page.locator("aside.cmts > .composer").getByRole("checkbox", { name: "Private" }).uncheck();
  await expect(page.locator("aside.cmts > .composer").getByRole("checkbox", { name: "Slack" })).toHaveCount(0);

  await connect(frank, true);
  const ctx = await browser.newContext();
  const cp = await ctx.newPage();
  await frank.loginAsClient(cp);
  await cp.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await expect(cp.locator("aside.cmts > .composer textarea")).toBeVisible({ timeout: 20_000 });
  await expect(cp.getByRole("checkbox", { name: "Slack" })).toHaveCount(0);
  await ctx.close();
});
