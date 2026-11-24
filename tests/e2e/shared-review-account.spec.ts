import { randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";
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
  return { email, membershipId: m.id as string };
}

// Direct instruction: an account is optional and changes nothing about
// giving feedback; Create an account emails the chosen name an invite.
test("Create an account on a review link emails the chosen name an invite", async ({ page, frank }) => {
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
  // No Close (reported directly: it did nothing).
  await expect(bar.getByRole("button", { name: "Close" })).toHaveCount(0);

  // No name yet.
  await line.getByRole("button", { name: "Create an account" }).click();
  await expect(line.getByRole("status")).toHaveText("Pick your name above first.");

  // The invited name: emailed, a fresh invite in place of the old one.
  await page.getByLabel("Who are you?").selectOption({ label: "Dana Invited" });
  await expect(line.getByRole("status")).toHaveCount(0);
  await line.getByRole("button", { name: "Create an account" }).click();
  await expect(line.getByRole("status")).toHaveText(
    `We've emailed ${invited.email} a link to set up your account. Your feedback here works the same either way.`,
  );
  const { data: invites } = await admin.from("invites").select("id, created_at, accepted_at").eq("membership_id", invited.membershipId);
  expect(invites).toHaveLength(1);
  expect(Date.now() - new Date(invites![0].created_at).getTime()).toBeLessThan(60_000);

  // Again straight away: not sent twice.
  await line.getByRole("button", { name: "Create an account" }).click();
  await expect(line.getByRole("status")).toHaveText(`We've just emailed ${invited.email} a link to set up your account. Check your inbox.`);
  expect((await admin.from("invites").select("id").eq("membership_id", invited.membershipId)).data).toHaveLength(1);

  // Someone who's joined already.
  await page.getByLabel("Who are you?").selectOption({ label: "Joe Joined" });
  await line.getByRole("button", { name: "Create an account" }).click();
  await expect(line.getByRole("status")).toHaveText("You already have an account. Log in to see everything in one place.");

  // Commenting still works without one.
  await page.getByLabel("Who are you?").selectOption({ label: "Dana Invited" });
  await page.locator("textarea").first().fill("Fine without an account");
  await page.getByRole("button", { name: /^(Post|Send)/ }).first().click();
  await expect(page.getByText("Fine without an account").first()).toBeVisible();
});

// Reported directly: on a post not in review yet there's no name list, and
// Create an account asked for a name with nowhere to pick it. It asks itself.
test("Create an account on a post not in review yet asks for the name itself", async ({ page, frank }) => {
  const invited = await seedClient(frank, "Dana Invited", false);
  // The link's post back before Client Review.
  await admin.from("creatives").update({ stage: 3 }).eq("id", frank.creativeId);
  const token = await frank.createSharedLink();
  await page.goto(`/review/${token}`);
  await page.waitForSelector(".m-top");
  const bar = page.locator(".m-bar");
  await expect(bar.locator(".m-noone")).toContainText("isn't ready for your review yet");
  await expect(bar.getByLabel("Who are you?")).toHaveCount(0);
  const line = bar.locator(".rv-account");
  await line.getByRole("button", { name: "Create an account" }).click();
  await line.getByLabel("Your name, for your account").selectOption({ label: "Dana Invited" });
  await line.getByRole("button", { name: "Email Me a Link" }).click();
  await expect(line.getByRole("status")).toHaveText(
    `We've emailed ${invited.email} a link to set up your account. Your feedback here works the same either way.`,
  );
});

test("Create an account refuses a name not on the link, and never returns the invite", async ({ request, frank }) => {
  const invited = await seedClient(frank, "Dana Invited", false);
  const token = await frank.createSharedLink();
  const off = await request.post(`${APP_URL}/api/shared-review/account`, { data: { token, email: "someone@example.invalid" } });
  expect(off.status()).toBe(404);
  const bad = await request.post(`${APP_URL}/api/shared-review/account`, { data: { token: "nope", email: invited.email } });
  expect(bad.status()).toBe(404);
  const ok = await request.post(`${APP_URL}/api/shared-review/account`, { data: { token, email: invited.email.toUpperCase() } });
  expect(await ok.json()).toEqual({ status: "sent" });
});
