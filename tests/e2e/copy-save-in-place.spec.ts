import { createClient } from "@supabase/supabase-js";
import { test, expect } from "./fixtures";

// Saving caption changes (phase113, direct instruction): into the current
// version, or as a new one; into the current one only while nobody has
// commented on it.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

test("copy saves into the current version until it has a comment, then as a new one", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await frank.createCopyVersion(frank.creativeId, 1, { caption: "First words" });
  const versions = async () =>
    (await admin.from("copy_versions").select("version_no, fields, edited_at").eq("creative_id", frank.creativeId).order("version_no")).data ?? [];

  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("tab", { name: "Content" }).click();
  const caption = page.locator('[data-focus="copy"] textarea').first();
  await caption.fill("First words, fixed");

  // No comments on V1: both, and Save to V1 changes it without a V2.
  await expect(page.getByRole("button", { name: "Save as V2" })).toBeEnabled();
  await page.getByRole("button", { name: "Save to V1" }).click();
  await expect(page.getByText("Saved to version 1.")).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await versions()).map((v) => [v.version_no, (v.fields as { caption: string }).caption, !!v.edited_at])).toEqual([
    [1, "First words, fixed", true],
  ]);

  // A comment on V1 (the team's own counts): only a new version now.
  const { data: v1 } = await admin.from("copy_versions").select("id").eq("creative_id", frank.creativeId).eq("version_no", 1).single();
  const staff = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await staff.auth.signInWithPassword({ email: frank.staffEmail, password: frank.staffPassword });
  const { data: me } = await staff.auth.getUser();
  const { error } = await staff.from("comments").insert({ creative_id: frank.creativeId, author_id: me.user!.id, body: "Shorter?", copy_version_id: v1!.id });
  expect(error).toBeNull();
  await page.reload();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("tab", { name: "Content" }).click();
  await page.locator('[data-focus="copy"] textarea').first().fill("Shorter words");
  await expect(page.getByRole("button", { name: "Save to V1" })).toHaveCount(0);
  await expect(page.getByText("V1 has a comment, so changes are saved as a new version.")).toBeVisible();
  await page.getByRole("button", { name: "Save as V2" }).click();
  await expect(page.getByText("Saved as version 2.")).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await versions()).map((v) => [v.version_no, (v.fields as { caption: string }).caption])).toEqual([
    [1, "First words, fixed"],
    [2, "Shorter words"],
  ]);
});

// Opened before the post's copy has loaded (a quick click, a slow
// connection): the caption fills in when it arrives, rather than staying
// empty for a save to empty it.
test("the Edit window opened before the copy has loaded fills in when it arrives", async ({ page, frank }) => {
  test.setTimeout(60_000);
  await frank.createCopyVersion(frank.creativeId, 1, { caption: "Loaded late" });
  await frank.loginAsStaff(page);
  // The copy held back three seconds.
  await page.route("**/rest/v1/copy_versions*", async (route) => {
    await new Promise((r) => setTimeout(r, 3_000));
    await route.continue();
  });
  await page.goto(`/creatives/${frank.creativeId}`);
  await expect(async () => {
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("tab", { name: "Content" }).click({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  const caption = page.locator('[data-focus="copy"] textarea').first();
  await expect(caption).toHaveValue("Loaded late", { timeout: 15_000 });
});
