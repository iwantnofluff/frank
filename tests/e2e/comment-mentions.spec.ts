import { createClient } from "@supabase/supabase-js";
import type { Browser } from "@playwright/test";
import { test, expect, APP_URL, TOUR_SEEN } from "./fixtures";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// A second team member (an Admin, so on every project's team), signed in in
// their own browser.
async function teammate(browser: Browser, agencyId: string, name: string) {
  const email = "e2e-mention-" + Date.now() + "-" + Math.round(Math.random() * 1e6) + "@example.invalid";
  const password = "E2e-Second-Test-1234!";
  const { data: u } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  const id = u.user!.id;
  await admin.from("users").insert({ tour_seen_at: TOUR_SEEN, id, email, name });
  const { data: m } = await admin
    .from("memberships")
    .insert({ agency_id: agencyId, user_id: id, role: "admin", accepted_at: new Date().toISOString() })
    .select("id")
    .single();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  return {
    id,
    page,
    async signIn() {
      await page.goto(APP_URL + "/login");
      await page.fill('input[type="email"]', email);
      await page.fill('input[type="password"]', password);
      await page.click('button[type="submit"]');
      await page.waitForURL("**/dashboard");
    },
    async remove() {
      await ctx.close();
      await admin.from("notifications").delete().eq("user_id", id);
      await admin.from("memberships").delete().eq("id", m!.id);
      await admin.from("users").delete().eq("id", id);
      await admin.auth.admin.deleteUser(id);
    },
  };
}

const kindsFor = async (userId: string) =>
  (await admin.from("notifications").select("kind").eq("user_id", userId)).data?.map((n) => n.kind) ?? [];

// @mentions in a post's comments (phase138, decided directly): the team
// mentions the project's team; whoever's mentioned gets a bell notice that
// opens the post at that comment. An edit tells only someone newly added.
test("a mention in a post's comment reaches the bell and opens the post at that comment", async ({ page, browser, frank }) => {
  test.setTimeout(150_000);
  const raj = await teammate(browser, frank.agencyId, "Raj Second");
  const mira = await teammate(browser, frank.agencyId, "Mira Third");
  try {
    await frank.loginAsStaff(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
    const box = page.getByPlaceholder("Add a comment…");
    await expect(box).toBeVisible({ timeout: 20_000 });

    // @ offers the project's team.
    await box.pressSequentially("Logo needs a final check, @Raj");
    await page.getByRole("option", { name: "@Raj Second" }).click();
    await box.pressSequentially("can you look?");
    await page.locator("aside .composer").last().getByRole("button", { name: "Post" }).click();
    const card = page.locator(".cmt", { hasText: "Logo needs a final check" });
    await expect(card.locator(".cbody .pj-mention")).toHaveText("@Raj Second");
    await expect.poll(() => kindsFor(raj.id), { timeout: 15_000 }).toEqual(["comment_mention"]);
    expect(await kindsFor(mira.id)).toEqual([]);

    // Editing it to add Mira tells Mira, not Raj again.
    await card.getByRole("button", { name: "Edit comment" }).click();
    const edit = card.getByLabel("Edit comment");
    await edit.press("End");
    await edit.pressSequentially(" Also @Mira");
    await card.getByRole("option", { name: "@Mira Third" }).click();
    await card.getByRole("button", { name: "Save" }).click();
    await expect(card.locator(".cbody .pj-mention")).toHaveText(["@Raj Second", "@Mira Third"]);
    await expect.poll(() => kindsFor(mira.id), { timeout: 15_000 }).toEqual(["comment_mention"]);
    expect(await kindsFor(raj.id)).toEqual(["comment_mention"]);

    // Raj's bell has it, and it opens the post with that comment picked out.
    await raj.signIn();
    const b = raj.page;
    await b.getByRole("button", { name: /Notifications/ }).click();
    const row = b.locator(".nrow", { hasText: "mentioned you on" });
    await expect(row).toContainText("E2E Staff mentioned you on E2E Test Creative");
    await row.click();
    await b.waitForURL(`**/creatives/${frank.creativeId}`);
    await expect(b.locator(".cmt.act", { hasText: "Logo needs a final check" })).toBeVisible({ timeout: 20_000 });
  } finally {
    await raj.remove();
    await mira.remove();
  }
});

test("a client gets no @ list, and a mention they send is dropped", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await frank.loginAsClient(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const box = page.getByPlaceholder("Add a comment…");
  await expect(box).toBeVisible({ timeout: 20_000 });
  await box.pressSequentially("Hello @E2E");
  await expect(page.getByRole("listbox", { name: "Mention someone" })).toHaveCount(0);

  // Sent straight to the database as the client, the mention doesn't stay.
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  const clientId = (await admin.from("users").select("id").eq("email", frank.clientEmail).single()).data!.id;
  const { error: authError } = await client.auth.signInWithPassword({ email: frank.clientEmail, password: frank.clientPassword });
  expect(authError).toBeNull();
  const { data, error } = await client
    .from("comments")
    .insert({ creative_id: frank.creativeId, author_id: clientId, body: "Hi @E2E Staff", visibility: "public", mentions: [staffId] })
    .select("id, mentions")
    .single();
  expect(error).toBeNull();
  expect(data!.mentions).toEqual([]);
  expect(
    (await admin.from("notifications").select("id").eq("comment_id", data!.id).eq("kind", "comment_mention")).data,
  ).toEqual([]);
});
