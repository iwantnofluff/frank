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
  const token = await frank.createSharedLink();
  await page.goto(`/review/${token}`);
  await page.waitForSelector(".m-top");

  const line = page.locator(".rv-signin");
  await expect(line).toContainText("An account is optional and doesn't change how you give feedback here.");
  await expect(line).toContainText("to see all of E2E Test Client's posts in one place, or log in.");

  // No name yet.
  await line.getByRole("button", { name: "Create an account" }).click();
  await expect(line.getByRole("status")).toHaveText("Choose your name first, then Create an account.");

  // The invited name: emailed, a fresh invite in place of the old one.
  await page.locator("select").first().selectOption({ label: "Dana Invited" });
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
  await page.locator("select").first().selectOption({ label: "Joe Joined" });
  await line.getByRole("button", { name: "Create an account" }).click();
  await expect(line.getByRole("status")).toHaveText("You already have an account. Log in to see everything in one place.");

  // Commenting still works without one.
  await page.locator("textarea").first().fill("Fine without an account");
  await page.getByRole("button", { name: /^(Post|Send)/ }).first().click();
  await expect(page.getByText("Fine without an account").first()).toBeVisible();
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
