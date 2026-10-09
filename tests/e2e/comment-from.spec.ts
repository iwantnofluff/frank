import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";

// Each comment on the Review page says whose side it's from, after the
// author's name (direct instruction): the agency's team, or the client —
// its own people, or a guest on a review link.
test("comments name the agency or the client after the author", async ({ page, frank }) => {
  await frank.insertCommentAsStaff("From the team", "public");
  // A client's person, through their own session (comments are caller-checked).
  const asClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  await asClient.auth.signInWithPassword({ email: frank.clientEmail, password: frank.clientPassword });
  const { data: me } = await asClient.auth.getUser();
  await asClient.from("comments").insert({ creative_id: frank.creativeId, author_id: me.user!.id, body: "From the client", visibility: "public" });
  // A guest on the review link — one of the client's own people (phase77).
  await frank.createClientContact("Guest Gail", "gail@example.com");
  const token = await frank.createSharedLink();
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const guest = await anon.rpc("submit_shared_comment", {
    p_token: token,
    p_passcode: null,
    p_creative_id: frank.creativeId,
    p_guest_name: "Guest Gail",
    p_guest_email: "gail@example.com",
    p_body: "From a guest",
  });
  expect(guest.error).toBeNull();
  expect(guest.data).toMatchObject({ status: "ok" });

  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await expect(page.locator(".cmt .cmt-h b")).toHaveText([
    "E2E Staff (E2E Test Agency)",
    "E2E Client User (E2E Test Client)",
    "Guest Gail (E2E Test Client)",
  ]);
});
