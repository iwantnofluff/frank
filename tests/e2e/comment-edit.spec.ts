import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";

// Editing your own comment (phase75, direct instruction): in place, marked
// "Edited". A review link's guest edits from the browser that posted it
// (its edit key is kept there); only a comment's author can change its
// words, though staff can still resolve it.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anonClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

test("on the post page, you edit your own comment in place", async ({ page, frank }) => {
  const id = await frank.insertCommentAsStaff("First thoughts on this", "public");
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const card = page.locator(`#cmt-${id}`);
  await card.getByRole("button", { name: "Edit" }).click();
  await card.getByLabel("Edit comment").fill("Second thoughts on this");
  await card.getByRole("button", { name: "Save" }).click();
  await expect(card).toContainText("Second thoughts on this");
  await expect(card.locator(".cedited")).toHaveText("Edited");
  const { data } = await admin.from("comments").select("body, edited_at").eq("id", id).single();
  expect(data!.body).toBe("Second thoughts on this");
  expect(data!.edited_at).not.toBeNull();
});

test("on a review link, a guest edits their own comment from the same browser only", async ({ page, frank, browser }) => {
  test.setTimeout(60_000);
  const token = await frank.createSharedLink();
  await page.goto(`${APP_URL}/review/${token}`);
  const picker = page.locator("select").first();
  await expect(page.getByPlaceholder("Add a comment…")).toBeVisible({ timeout: 15_000 });
  if (await picker.count()) await picker.selectOption({ label: "Someone else" }).catch(() => {});
  if (await page.getByPlaceholder("Your name").count()) {
    await page.getByPlaceholder("Your name").fill("Guest Viewer");
    await page.getByPlaceholder("Your email").fill("guest@example.invalid");
  }
  await page.getByPlaceholder("Add a comment…").fill("Guest first go");
  await page.getByRole("button", { name: "Post", exact: true }).click();
  const card = page.locator(".cmt:not(.pending)", { hasText: "Guest first go" });
  await card.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Edit comment").fill("Guest second go");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".cmt", { hasText: "Guest second go" })).toContainText("Edited", { timeout: 15_000 });
  const { data: row } = await admin.from("comments").select("id, body, edited_at").eq("creative_id", frank.creativeId).eq("body", "Guest second go").single();
  expect(row!.edited_at).not.toBeNull();

  // Another browser sees it, with no Edit; a made-up key is refused.
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await p2.goto(`${APP_URL}/review/${token}`);
  await expect(p2.locator(".cmt", { hasText: "Guest second go" })).toBeVisible({ timeout: 15_000 });
  await expect(p2.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  await other.close();
  const { data: refused } = await anonClient().rpc("edit_shared_comment", {
    p_token: token,
    p_passcode: null,
    p_comment_id: row!.id,
    p_edit_key: "x".repeat(72),
    p_body: "Not mine",
  });
  expect(refused).toEqual({ status: "not_yours" });

  // Staff can't rewrite it, but can still resolve it.
  const staff = anonClient();
  await staff.auth.signInWithPassword({ email: frank.staffEmail, password: frank.staffPassword });
  const rewrite = await staff.from("comments").update({ body: "Staff words" }).eq("id", row!.id).select("id");
  expect(rewrite.error?.message).toContain("only its author can change a comment");
  const resolve = await staff.from("comments").update({ resolved_at: new Date().toISOString() }).eq("id", row!.id).select("id");
  expect(resolve.data).toHaveLength(1);
  await staff.auth.signOut();
});
