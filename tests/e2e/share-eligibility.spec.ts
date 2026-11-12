import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL, PHONE_VIEWPORT } from "./fixtures";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });

// Share at any status (phase150, direct instruction): the account manager
// decides whether to send the link. Every post can be picked; the window
// says which the client can only read.
test("Share for review shows at any status, and every post can be picked", async ({ page, frank }) => {
  const conceptId = await frank.createCreativeAtStage(1, "Concept Post");
  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${conceptId}`);
  await page.waitForSelector(".stage-h");
  await page.getByRole("button", { name: "Share for review" }).click();
  await expect(page.getByText("This post isn't in Client Review, so the client can read it but not comment until it is.")).toBeVisible();

  await page.click('button[role="radio"]:has-text("Multiple Posts")');
  await expect(page.locator(".pktile.ineligible")).toHaveCount(0);
  // The fixture's own post (Client Review) picked too: one of two read only.
  const other = page.locator(".pktile", { hasText: "E2E Test Creative" });
  await expect(other).not.toHaveClass(/selected/);
  await other.click();
  await expect(other).toHaveClass(/selected/);
  await expect(page.getByText("1 of 2 aren't in Client Review", { exact: false })).toBeVisible();
  await page.click('button:has-text("Create link")');
  await expect(page.locator(".linkrow code")).toBeVisible();
});

// The client reads a post shared before Client Review, and has their say
// (comment, ask for changes, approve, edit their words) only in it.
test("a client comments on a review link only in Client Review", async ({ browser, frank }) => {
  test.setTimeout(90_000);
  await admin.from("creatives").update({ stage: 1 }).eq("id", frank.creativeId);
  await frank.createClientContact("Priya Client", "priya@example.invalid");
  const token = await frank.createSharedLink({ canApprove: true });
  const who = { p_token: token, p_passcode: null, p_creative_id: frank.creativeId, p_guest_name: "Priya Client", p_guest_email: "priya@example.invalid" };

  const g = await (await browser.newContext({ viewport: PHONE_VIEWPORT })).newPage();
  await g.goto(`${APP_URL}/review/${token}`);
  await expect(g.locator(".m-bar")).toContainText("This post isn't ready for your review yet. You can read it, and comment once it is.", { timeout: 20_000 });
  await expect(g.locator(".m-bar textarea")).toHaveCount(0);
  await expect(g.getByRole("button", { name: "Approve" })).toHaveCount(0);

  const db = anon();
  expect((await db.rpc("submit_shared_comment", { ...who, p_body: "Too early" })).data).toMatchObject({ status: "not_at_review" });
  expect((await db.rpc("submit_shared_request_changes", { ...who, p_body: "Too early" })).data).toMatchObject({ status: "not_at_review" });
  expect((await db.rpc("submit_shared_approval", who)).data).toMatchObject({ status: "not_at_review" });

  await admin.from("creatives").update({ stage: 4 }).eq("id", frank.creativeId);
  const key = "k".repeat(40);
  const posted = await db.rpc("submit_shared_comment", { ...who, p_body: "Now it's my turn", p_edit_key: key });
  expect(posted.data).toMatchObject({ status: "ok" });
  await g.reload();
  await expect(g.locator(".m-bar textarea")).toBeVisible({ timeout: 20_000 });
  // As on the post's page in Frank: initials, whose side, "just now".
  await expect(g.locator(".m-cmt", { hasText: "Now it's my turn" }).locator(".ch b")).toHaveText("Priya Client (E2E Test Client)");
  await expect(g.locator(".m-cmt", { hasText: "Now it's my turn" }).locator(".av")).toHaveText("PC");

  // Moved on: their words stay as they are.
  await admin.from("creatives").update({ stage: 2 }).eq("id", frank.creativeId);
  const edit = await db.rpc("edit_shared_comment", { p_token: token, p_passcode: null, p_comment_id: posted.data.comment_id, p_edit_key: key, p_body: "Changed" });
  expect(edit.data).toMatchObject({ status: "not_at_review" });
});

// The team, signed in, on a review link: the post's own comments as in
// Frank (Private ones too), commenting as themselves, and no Approve. On a
// computer, a post not yet in Client Review is listed as Not ready for
// review yet.
test("the team signed in on a review link comments as themselves", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await admin.from("creatives").update({ stage: 1 }).eq("id", frank.creativeId);
  await frank.insertCommentAsStaff("Team-only thought", "private");
  await frank.createClientContact("Priya Client", "priya@example.invalid");
  const token = await frank.createSharedLink({ canApprove: true });
  await frank.loginAsStaff(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}/review/${token}`);
  const panel = page.locator(".rv-team");
  await expect(panel.locator(".cmt", { hasText: "Team-only thought" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Approve" })).toHaveCount(0);
  await expect(page.getByText("Who are you?")).toHaveCount(0);
  await expect(page.getByText("Not ready for review yet")).toBeVisible();

  const box = panel.locator("aside > .composer");
  await box.locator("textarea").fill("From the link");
  await box.getByRole("button", { name: "Post", exact: true }).click();
  await expect(panel.locator(".cmt:not(.pending)", { hasText: "From the link" })).toBeVisible({ timeout: 15_000 });
  const { data: staff } = await admin.from("users").select("id").eq("email", frank.staffEmail).single();
  const { data: row } = await admin.from("comments").select("author_id, guest_name, visibility").eq("body", "From the link").single();
  expect(row).toEqual({ author_id: staff!.id, guest_name: null, visibility: "private" });
});
