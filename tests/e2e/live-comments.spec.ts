import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL, PHONE_VIEWPORT } from "./fixtures";

// Comments appear on every open page without a refresh, whatever device
// made them (direct instruction; phase65). Signed-in pages hear the change
// from the database straight away; a review link's guest has no session,
// so their page checks for changes every few seconds instead.

test("a comment made elsewhere appears on an open post page, no reload", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await page.waitForSelector(".cmts");
  // Let the page's live connection join first.
  await page.waitForTimeout(2500);

  // The client's person, through their own session, as on their phone.
  const phone = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  await phone.auth.signInWithPassword({ email: frank.clientEmail, password: frank.clientPassword });
  const { data: me } = await phone.auth.getUser();
  await phone.from("comments").insert({ creative_id: frank.creativeId, author_id: me.user!.id, body: "Made on the phone", visibility: "public" });

  await expect(page.getByText("Made on the phone")).toBeVisible({ timeout: 10_000 });
});

test("a review link's guest sees new public comments without a refresh, never private ones", async ({ browser, frank }) => {
  test.setTimeout(90_000);
  const token = await frank.createSharedLink();
  const ctx = await browser.newContext({ viewport: PHONE_VIEWPORT });
  const guest = await ctx.newPage();
  await guest.goto(`${APP_URL}/review/${token}`);
  await guest.waitForSelector(".m-top");

  await frank.insertCommentAsStaff("Public reply from the desktop", "public");
  await frank.insertCommentAsStaff("Private team note", "private");
  await expect(guest.getByText("Public reply from the desktop")).toBeVisible({ timeout: 20_000 });
  await expect(guest.getByText("Private team note")).toHaveCount(0);
  await ctx.close();
});
