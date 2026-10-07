import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL, type Frank } from "./fixtures";

// "Draft with Frank" (phase52; was "Write with Claude"). Live AI replies are never asserted here
// (CLAUDE.md): a conversation is seeded, and the window, "Use This", the
// route's own refusals and who can read conversations are checked.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function seedChat(frank: Frank) {
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  const { data: chat } = await admin
    .from("copy_chats")
    .insert({ creative_id: frank.creativeId, mode: "draft", created_by: staffId })
    .select("id")
    .single();
  const { error } = await admin.from("copy_chat_messages").insert([
    { chat_id: chat!.id, role: "user", body: "Draft some copy for this post from the concept.", drafts: [], created_by: staffId },
    {
      chat_id: chat!.id,
      role: "assistant",
      body: "Two angles to try.",
      created_by: null,
      drafts: [{ label: "Playful", fields: { caption: "Dessert, but make it daily." } }],
    },
  ]);
  if (error) throw new Error(`Seeding the conversation failed: ${error.message}`);
  return chat!.id as string;
}

test("Draft with Frank reopens a conversation, and Use This fills the editor", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await seedChat(frank);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: "Write Copy" }).click();
  const post = page.locator(".scrim .modal").first();
  await post.getByRole("button", { name: "Draft with Frank" }).click();

  const chat = page.getByRole("dialog", { name: "Draft with Frank" });
  // Nothing written yet, so there's nothing to review.
  await expect(chat.getByRole("button", { name: "Review My Draft" })).toBeDisabled();
  await chat.getByRole("button", { name: /Drafted from the concept/ }).click();
  await expect(chat.locator(".cchat-msg.user")).toContainText("Draft some copy for this post from the concept.");
  await expect(chat.locator(".cchat-draft")).toContainText("Dessert, but make it daily.");
  await page.screenshot({ path: `${process.env.SHOT_DIR ?? "test-results"}/copy-chat.png`, animations: "disabled" });
  await chat.getByRole("button", { name: "Use This" }).click();
  await expect(chat.getByRole("button", { name: "In the editor" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(chat).toHaveCount(0);
  // Into the editor, not saved as a version.
  const caption = post.locator(".field", { has: page.locator("label", { hasText: /^Caption$/ }) }).locator("textarea");
  await expect(caption).toHaveValue("Dessert, but make it daily.");
  expect((await admin.from("copy_versions").select("id").eq("creative_id", frank.creativeId)).data).toEqual([]);
  // With copy in, a review can be asked for.
  await post.getByRole("button", { name: "Draft with Frank" }).click();
  await expect(chat.getByRole("button", { name: "Review My Draft" })).toBeEnabled();
});

test("the route refuses a review with no draft and anyone but staff; Clients can't read conversations", async ({
  page,
  browser,
  frank,
}) => {
  await seedChat(frank);
  await frank.loginAsStaff(page);
  const empty = await page.request.post(`${APP_URL}/api/ai/copy-chat`, {
    data: { creativeId: frank.creativeId, mode: "review", currentFields: {} },
  });
  expect(empty.status()).toBe(400);
  expect((await empty.json()).error).toBe("Write a first draft to review");

  const ctx = await browser.newContext();
  try {
    const cp = await ctx.newPage();
    await frank.loginAsClient(cp);
    const res = await cp.request.post(`${APP_URL}/api/ai/copy-chat`, {
      data: { creativeId: frank.creativeId, mode: "draft", currentFields: {} },
    });
    expect([403, 404]).toContain(res.status());
  } finally {
    await ctx.close();
  }
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  await c.auth.signInWithPassword({ email: frank.clientEmail, password: frank.clientPassword });
  expect((await c.from("copy_chats").select("id")).data ?? []).toHaveLength(0);
  expect((await c.from("copy_chat_messages").select("id")).data ?? []).toHaveLength(0);
});
