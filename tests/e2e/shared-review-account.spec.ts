import { randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { createInviteToken } from "../../lib/invites/token";
import { test, expect, APP_URL, PHONE_VIEWPORT, TOUR_SEEN, type Frank } from "./fixtures";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

test.use({ viewport: PHONE_VIEWPORT });

// A Client of the fixture's client, invited (or joined); the membership's
// trigger puts them on the link's Who are you? list. .invalid, so the
// invite email is never really sent, and teardown sweeps them.
async function seedClient(frank: Frank, name: string, joined: boolean) {
  const email = `e2e-member-${Date.now()}-${randomBytes(3).toString("hex")}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error) throw error;
  await admin.from("users").insert({ tour_seen_at: TOUR_SEEN, id: data.user.id, email, name });
  const { data: m, error: mErr } = await admin
    .from("memberships")
    .insert({
      agency_id: frank.agencyId,
      user_id: data.user.id,
      role: "user",
      client_id: frank.clientId,
      accepted_at: joined ? new Date().toISOString() : null,
      // Invited by the team, as every invite is.
      invited_by: (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id,
    })
    .select("id")
    .single();
  if (mErr) throw mErr;
  return { email, userId: data.user.id, membershipId: m.id as string };
}

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
const PASSWORD = "Review-Link-1234";

// Direct instruction: an account is optional and changes nothing about
// giving feedback. Create an account opens a window to choose a password;
// an email's link then activates it, by logging in with that password.
test("Create an account: a window to choose a password, then an email to activate it", async ({ page, frank }) => {
  const invited = await seedClient(frank, "Dana Invited", false);
  await seedClient(frank, "Joe Joined", true);
  const token = await frank.createSharedLink({ canApprove: true });
  await page.goto(`/review/${token}`);
  await page.waitForSelector(".m-top");

  // In order (direct instruction): the first step leads, the account comes last.
  const bar = page.locator(".m-bar");
  await expect(bar.locator(".rv-lead")).toHaveText("Pick your name, then comment or approve.");
  const line = bar.locator(".rv-account");
  await expect(line).toContainText(
    "Optional" + "Want all of E2E Test Client's posts in one place? Create an account or log in. You don't need one to comment or approve.",
  );
  const order = await bar.evaluate((el) =>
    [".rv-lead", "select", "textarea", ".m-decide", ".rv-account"].map((sel) =>
      Array.from(el.querySelectorAll("*")).indexOf(el.querySelector(sel)!),
    ),
  );
  expect(order).toEqual([...order].sort((a, b) => a - b));
  await expect(bar.getByRole("button", { name: "Close" })).toHaveCount(0);

  // No name picked: the window asks for it.
  await line.getByRole("button", { name: "Create an account" }).click();
  const win = page.getByRole("dialog", { name: "Create Your Account" });
  await expect(win).toContainText("Optional. You don't need an account to comment or approve.");
  await expect(win.getByRole("button", { name: "Create Account" })).toBeDisabled();
  await win.getByLabel("Who are you?").selectOption({ label: "Dana Invited" });
  await expect(win.getByLabel("Email")).toHaveValue(invited.email);
  // One box (direct instruction), with Show.
  const box = win.getByLabel("Password", { exact: true });
  await expect(win.locator('input[type="password"]')).toHaveCount(1);
  await box.fill("short");
  await expect(box).toHaveAttribute("type", "password");
  await win.getByRole("button", { name: "Show" }).click();
  await expect(box).toHaveAttribute("type", "text");
  await win.getByRole("button", { name: "Hide" }).click();
  await expect(box).toHaveAttribute("type", "password");
  await win.getByRole("button", { name: "Create Account" }).click();
  await expect(win.locator(".autherr")).toHaveText("Use at least 8 characters.");
  await box.fill(PASSWORD);
  await win.getByRole("button", { name: "Create Account" }).click();
  const sent = page.getByRole("dialog", { name: "Check Your Email" });
  await expect(sent).toContainText(
    `We've emailed ${invited.email} a link. Open it and log in with the password you just chose to activate your account.`,
  );
  // The password is set, but nothing is on until it's activated.
  const { error: signInError } = await anon().auth.signInWithPassword({ email: invited.email, password: PASSWORD });
  expect(signInError).toBeNull();
  const { data: m } = await admin.from("memberships").select("accepted_at").eq("id", invited.membershipId).single();
  expect(m!.accepted_at).toBeNull();
  expect((await admin.from("invites").select("id").eq("membership_id", invited.membershipId)).data).toHaveLength(1);
  await sent.getByRole("button", { name: "Done" }).click();

  // Again straight away: not sent twice.
  await page.getByLabel("Who are you?").selectOption({ label: "Dana Invited" });
  await line.getByRole("button", { name: "Create an account" }).click();
  await expect(win.getByRole("status")).toHaveText(
    `We emailed ${invited.email} a link a moment ago. Use that one, or try again in a minute.`,
  );
  await win.getByRole("button", { name: "Done" }).click();

  // Someone who's joined already.
  await page.getByLabel("Who are you?").selectOption({ label: "Joe Joined" });
  await line.getByRole("button", { name: "Create an account" }).click();
  await expect(win.getByRole("status")).toHaveText("You already have an account. Log in to see everything in one place.");
  await win.getByRole("button", { name: "Done" }).click();

  // Commenting still works without one.
  await page.getByLabel("Who are you?").selectOption({ label: "Dana Invited" });
  await page.locator("textarea").first().fill("Fine without an account");
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await expect(page.getByText("Fine without an account").first()).toBeVisible();
});

// The email's link (direct instruction): a log-in with the email filled
// in; the password activates it and brings them back to the review link,
// signed in, with the way to their planner.
test("the email's link activates the account with its password, back on the review link signed in", async ({ page, frank }) => {
  const invited = await seedClient(frank, "Dana Invited", false);
  await admin.auth.admin.updateUserById(invited.userId, { password: PASSWORD });
  const { token: inviteToken, tokenHash } = createInviteToken();
  const { error } = await admin.from("invites").insert({
    agency_id: frank.agencyId,
    membership_id: invited.membershipId,
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    created_by: (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id,
  });
  if (error) throw error;
  const linkToken = await frank.createSharedLink({ canApprove: true });

  // Nobody signed in can't activate it.
  const bare = await page.request.post(`${APP_URL}/api/invite/activate`, { data: { token: inviteToken } });
  expect(bare.status()).toBe(401);

  await page.goto(`/invite/activate/${inviteToken}?back=${encodeURIComponent(`/review/${linkToken}`)}`);
  await expect(page.getByRole("heading", { name: "Activate your account" })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveValue(invited.email);
  await page.getByLabel("Password").fill("Wrong-password-1");
  await page.getByRole("button", { name: "Activate and Log In" }).click();
  await expect(page.locator(".autherr")).toContainText("That isn't the password chosen for this account.");
  await expect(page.getByRole("link", { name: "Forgot your password?" })).toBeVisible();
  const { data: still } = await admin.from("memberships").select("accepted_at").eq("id", invited.membershipId).single();
  expect(still!.accepted_at).toBeNull();

  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Activate and Log In" }).click();
  await page.waitForURL(`**/review/${linkToken}`);
  const { data: on } = await admin.from("memberships").select("accepted_at").eq("id", invited.membershipId).single();
  expect(on!.accepted_at).not.toBeNull();
  const bar = page.locator(".m-bar");
  await expect(bar.locator(".rv-account")).toHaveText(
    `Signed in as ${invited.email}. See all of E2E Test Client's posts in your content planner.`,
  );
  await expect(bar.getByRole("link", { name: "See all of E2E Test Client's posts in your content planner" })).toHaveAttribute(
    "href",
    `/clients/${frank.clientId}`,
  );
  // And they're who they are here.
  await expect(bar.locator(".m-signedin")).toContainText("Commenting as Dana Invited");
  await expect(bar.locator(".m-signedin .av")).toHaveText("D");
});

// Reported directly: on a post not in review yet there's no name list, and
// Create an account asked for a name with nowhere to pick it. The window asks.
test("Create an account on a post not in review yet asks for the name in its window", async ({ page, frank }) => {
  const invited = await seedClient(frank, "Dana Invited", false);
  await admin.from("creatives").update({ stage: 3 }).eq("id", frank.creativeId);
  const token = await frank.createSharedLink();
  await page.goto(`/review/${token}`);
  await page.waitForSelector(".m-top");
  const bar = page.locator(".m-bar");
  await expect(bar.locator(".m-noone")).toContainText("isn't ready for your review yet");
  await expect(bar.getByLabel("Who are you?")).toHaveCount(0);
  await bar.locator(".rv-account").getByRole("button", { name: "Create an account" }).click();
  const win = page.getByRole("dialog", { name: "Create Your Account" });
  await win.getByLabel("Who are you?").selectOption({ label: "Dana Invited" });
  await expect(win.getByLabel("Email")).toHaveValue(invited.email);
  await expect(win.getByLabel("Password", { exact: true })).toBeVisible();
});

test("the endpoint refuses a name not on the link, never returns a link, and leaves an existing password alone", async ({ request, frank }) => {
  const invited = await seedClient(frank, "Dana Invited", false);
  const existing = await seedClient(frank, "Uses Frank", false);
  // Signed in before: a password of their own.
  await admin.auth.admin.updateUserById(existing.userId, { password: "Their-own-1234" });
  await anon().auth.signInWithPassword({ email: existing.email, password: "Their-own-1234" });
  const token = await frank.createSharedLink();
  const post = (data: object) => request.post(`${APP_URL}/api/shared-review/account`, { data: { token, ...data } });

  expect((await post({ email: "someone@example.invalid", step: "check" })).status()).toBe(404);
  const bad = await request.post(`${APP_URL}/api/shared-review/account`, { data: { token: "nope", email: invited.email } });
  expect(bad.status()).toBe(404);
  expect(await (await post({ email: invited.email.toUpperCase(), step: "check" })).json()).toEqual({ status: "new" });
  expect(await (await post({ email: invited.email, step: "send", password: "short" })).json()).toEqual({ status: "short_password" });
  expect(await (await post({ email: invited.email, step: "send", password: PASSWORD })).json()).toEqual({ status: "sent" });
  // One a minute: straight away it waits, a minute on it's offered again.
  expect(await (await post({ email: invited.email, step: "check" })).json()).toEqual({ status: "already_sent" });
  await admin
    .from("invites")
    .update({ created_at: new Date(Date.now() - 61_000).toISOString() })
    .eq("membership_id", invited.membershipId);
  expect(await (await post({ email: invited.email, step: "check" })).json()).toEqual({ status: "new" });

  expect(await (await post({ email: existing.email, step: "check" })).json()).toEqual({ status: "existing" });
  expect(await (await post({ email: existing.email, step: "send", password: "Attacker-pass-1" })).json()).toEqual({ status: "sent" });
  const { error: ownStill } = await anon().auth.signInWithPassword({ email: existing.email, password: "Their-own-1234" });
  expect(ownStill).toBeNull();
});
