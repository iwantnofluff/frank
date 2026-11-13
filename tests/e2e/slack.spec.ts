import http from "node:http";
import { createCipheriv, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";

// Slack (phase154, direct instruction): a workspace connects its Slack once;
// each project picks a channel, Owners and Admins only; the client's
// activity and the team's comments post there, Private ones unless turned
// off. Against a stand-in Slack on port 3199 (scripts/e2e-local.mjs points
// the test app at it), so only in the local run.
test.skip(!process.env.SLACK_API_BASE, "Needs the local run's stand-in Slack (npm run test:local).");
test.describe.configure({ mode: "serial" });

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

interface Posted {
  channel: string;
  text: string;
  blocks: { text?: { text: string }; elements?: { text?: string; url?: string }[] }[];
  auth: string | undefined;
}
const posted: Posted[] = [];
let slack: http.Server;

test.beforeAll(async () => {
  slack = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const path = new URL(req.url!, "http://slack").pathname;
      res.setHeader("Content-Type", "application/json");
      if (path === "/api/conversations.list") {
        res.end(
          JSON.stringify({
            ok: true,
            channels: [
              { id: "C_GENERAL", name: "general", is_private: false },
              { id: "C_Q4", name: "q4-social", is_private: false },
              { id: "C_TEAM", name: "team-only", is_private: true },
            ],
          }),
        );
      } else if (path === "/api/chat.postMessage") {
        const msg = JSON.parse(body);
        if (String(msg.channel).startsWith("C_NOTIN")) {
          res.end(JSON.stringify({ ok: false, error: "not_in_channel" }));
          return;
        }
        posted.push({ ...msg, auth: req.headers.authorization });
        res.end(JSON.stringify({ ok: true }));
      } else {
        res.statusCode = 404;
        res.end("{}");
      }
    });
  });
  await new Promise<void>((resolve) => slack.listen(3199, resolve));
});
test.afterAll(async () => {
  await new Promise((resolve) => slack.close(resolve));
});

// Saved as Frank's callback would: the bot key encrypted under the test
// app's SLACK_TOKEN_KEY (lib/slack/secrets.ts).
async function connect(agencyId: string, token: string) {
  const key = Buffer.from(process.env.SLACK_TOKEN_KEY!, "base64");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const enc = Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
  const { error } = await admin
    .from("slack_connections")
    .insert({ agency_id: agencyId, team_id: "T_E2E", team_name: "E2E Slack", bot_token_enc: enc, connected_by_name: "E2E Staff" });
  if (error) throw error;
}

const headline = (p: Posted) => p.blocks[0]?.text?.text ?? "";
const onChannel = (channel: string) => posted.filter((p) => p.channel === channel);
// As the app does straight after something happens on a post.
const sendNow = (creativeId: string) =>
  fetch(`${APP_URL}/api/notify/client-activity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creativeId }),
  });

test("an Owner or Admin connects Slack, and chooses a project's channel and what goes to it", async ({ page, frank }) => {
  test.setTimeout(120_000);
  await frank.loginAsStaff(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}/settings/connections/slack`);
  await expect(page.getByText("Not connected")).toBeVisible({ timeout: 20_000 });
  const add = page.getByRole("link", { name: "Add to Slack" });
  await expect(add).toHaveAttribute("href", `/api/connections/slack/start?agencyId=${frank.agencyId}`);
  // Add to Slack sends them to Slack, asking for Frank's permissions and
  // naming where to come back to.
  const start = await page.request.get(`${APP_URL}/api/connections/slack/start?agencyId=${frank.agencyId}`, { maxRedirects: 0 });
  expect(start.status()).toBe(307);
  const to = new URL(start.headers().location);
  expect(to.origin + to.pathname).toBe("http://localhost:3199/oauth/v2/authorize");
  expect(to.searchParams.get("client_id")).toBe("e2e-client");
  expect(to.searchParams.get("scope")).toBe("chat:write,chat:write.public,channels:read,groups:read");
  expect(to.searchParams.get("redirect_uri")).toMatch(/\/api\/connections\/slack\/callback$/);
  expect(to.searchParams.get("state")).toBeTruthy();

  await connect(frank.agencyId, "xoxb-e2e-1");
  await page.reload();
  await expect(page.getByText("E2E Slack")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Connected by E2E Staff", { exact: false })).toBeVisible();

  // Project Settings: a channel from the list, searched.
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Choose Channel" }).click();
  const list = page.getByRole("listbox", { name: "Slack channels" });
  await expect(list.getByRole("option")).toHaveText(["#general", "#q4-social", "#team-onlyprivate"]);
  await page.getByLabel("Search Slack channels").fill("q4");
  await list.getByRole("option", { name: "#q4-social" }).click();
  await expect(page.getByText("Posting to #q4-social in E2E Slack")).toBeVisible();
  await expect.poll(async () => (await admin.from("project_slack").select("channel_id, channel_name, client_activity, team_comments, include_private").eq("project_id", frank.projectId).single()).data).toEqual({
    channel_id: "C_Q4",
    channel_name: "q4-social",
    client_activity: true,
    team_comments: true,
    include_private: true,
  });
  // Private comments off; Team comments off greys it out.
  await page.getByRole("checkbox", { name: /Include Private comments/ }).click();
  await expect.poll(async () => (await admin.from("project_slack").select("include_private").eq("project_id", frank.projectId).single()).data!.include_private).toBe(false);
  await page.getByRole("checkbox", { name: /Team comments/ }).click();
  await expect(page.getByRole("checkbox", { name: /Include Private comments/ })).toBeDisabled();

  // A User sees the channel and can't change it, here or in the database.
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  const { data: m } = await admin.from("memberships").update({ role: "user" }).eq("user_id", staffId).eq("agency_id", frank.agencyId).select("id").single();
  await admin.from("staff_client_access").insert({ membership_id: m!.id, client_id: frank.clientId });
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByText("Posting to #q4-social in E2E Slack")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Change Channel" })).toHaveCount(0);
  const u = anon();
  await u.auth.signInWithPassword({ email: frank.staffEmail, password: frank.staffPassword });
  expect((await u.from("project_slack").update({ channel_name: "hijack" }).eq("project_id", frank.projectId).select("project_id")).data ?? []).toHaveLength(0);
  expect((await u.from("slack_connections").select("bot_token_enc")).data ?? []).toHaveLength(0);
});

test("the client's activity and the team's comments post to the project's channel", async ({ page, frank }) => {
  test.setTimeout(150_000);
  const channel = `C_POST_${Date.now()}`;
  await connect(frank.agencyId, "xoxb-e2e-2");
  await admin.from("project_slack").insert({ project_id: frank.projectId, channel_id: channel, channel_name: "q4-social" });

  // The team, on the post's page: Public, then Private.
  await frank.loginAsStaff(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const box = page.locator("aside.cmts > .composer");
  await expect(box.locator("textarea")).toBeVisible({ timeout: 20_000 });
  const post = async (words: string, isPrivate: boolean) => {
    await box.locator("textarea").fill(words);
    const priv = box.getByRole("checkbox", { name: "Private" });
    if ((await priv.isChecked()) !== isPrivate) await priv.click();
    await box.getByRole("button", { name: "Post", exact: true }).click();
    await expect(page.locator(".cmt:not(.pending)", { hasText: words })).toBeVisible({ timeout: 15_000 });
  };
  await post("Colours look off on mobile", false);
  await expect.poll(() => onChannel(channel).length, { timeout: 15_000 }).toBe(1);
  const first = onChannel(channel)[0];
  expect(headline(first)).toBe("*E2E Staff (E2E Test Agency)* commented on *E2E Test Creative*");
  expect(first.blocks[1].text!.text).toBe(">Colours look off on mobile");
  expect(first.auth).toBe("Bearer xoxb-e2e-2");
  const button = first.blocks.at(-1)!.elements![0];
  expect(button.url).toMatch(new RegExp(`/creatives/${frank.creativeId}\\?comment=`));
  await post("Between us: the client will push back", true);
  await expect.poll(() => onChannel(channel).length, { timeout: 15_000 }).toBe(2);
  expect(JSON.stringify(onChannel(channel)[1].blocks)).toContain("Private comment, for the team");

  // Private ones off: nothing owed for the next.
  await admin.from("project_slack").update({ include_private: false }).eq("project_id", frank.projectId);
  await post("Another private aside", true);
  await page.waitForTimeout(3000);
  expect(onChannel(channel)).toHaveLength(2);

  // The client, on a review link: a comment, a change request, an approval.
  await frank.createClientContact("Priya Client", "priya@example.invalid");
  const token = await frank.createSharedLink({ canApprove: true });
  const who = { p_token: token, p_passcode: null, p_creative_id: frank.creativeId, p_guest_name: "Priya Client", p_guest_email: "priya@example.invalid" };
  const db = anon();
  expect((await db.rpc("submit_shared_comment", { ...who, p_body: "Love the headline" })).data).toMatchObject({ status: "ok" });
  await sendNow(frank.creativeId);
  await expect.poll(() => onChannel(channel).length, { timeout: 15_000 }).toBe(3);
  expect(headline(onChannel(channel)[2])).toBe("*Priya Client (E2E Test Client)* commented on *E2E Test Creative*");
  expect(JSON.stringify(onChannel(channel)[2].blocks)).toContain("E2E Test Project · E2E Test Client");

  expect((await db.rpc("submit_shared_request_changes", { ...who, p_body: "Swap the photo" })).data).toMatchObject({ status: "ok" });
  await sendNow(frank.creativeId);
  await expect.poll(() => onChannel(channel).length, { timeout: 15_000 }).toBe(4);
  expect(headline(onChannel(channel)[3])).toBe("*Priya Client (E2E Test Client)* asked for changes on *E2E Test Creative*");
  expect(onChannel(channel)[3].blocks[1].text!.text).toBe(">Swap the photo");

  await admin.from("creatives").update({ exception: null }).eq("id", frank.creativeId);
  expect((await db.rpc("submit_shared_approval", who)).data).toMatchObject({ status: "ok" });
  await sendNow(frank.creativeId);
  await expect.poll(() => onChannel(channel).length, { timeout: 15_000 }).toBe(5);
  expect(headline(onChannel(channel)[4])).toBe("*Priya Client (E2E Test Client)* approved *E2E Test Creative*");

  // Sent once: asking again sends nothing more.
  await sendNow(frank.creativeId);
  await page.waitForTimeout(1500);
  expect(onChannel(channel)).toHaveLength(5);
});

test("a channel Frank isn't in says so in Project Settings", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await connect(frank.agencyId, "xoxb-e2e-3");
  await admin.from("project_slack").insert({ project_id: frank.projectId, channel_id: "C_NOTIN_1", channel_name: "secret-room" });
  await frank.insertCommentAsStaff("Is this reaching Slack?", "public");
  await sendNow(frank.creativeId);
  await expect
    .poll(async () => (await admin.from("project_slack").select("last_error").eq("project_id", frank.projectId).single()).data!.last_error, { timeout: 15_000 })
    .toBe("Frank isn't in the channel. Invite it with /invite @Frank there.");
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByText("Frank isn't in the channel. Invite it with /invite @Frank there.")).toBeVisible({ timeout: 20_000 });
});
