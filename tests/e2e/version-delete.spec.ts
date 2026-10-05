import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { test, expect, APP_URL } from "./fixtures";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function signedIn(email: string, password: string) {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}

async function copyVersions(creativeId: string) {
  const { data } = await admin.from("copy_versions").select("id, version_no").eq("creative_id", creativeId).order("version_no");
  return data!;
}

async function picture(page: Page) {
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 400;
    c.height = 500;
    const g = c.getContext("2d")!;
    g.fillStyle = "#0f766e";
    g.fillRect(0, 0, 400, 500);
    return c.toDataURL("image/png").split(",")[1];
  });
  return { name: "art.png", mimeType: "image/png", buffer: Buffer.from(b64, "base64") };
}

test("copy versions have tabs, and one without comments can be deleted", async ({ page, frank }) => {
  test.setTimeout(60_000);
  await frank.createCopyVersion(frank.creativeId, 1, { caption: "First caption" });
  await frank.createCopyVersion(frank.creativeId, 2, { caption: "Second caption" });
  // A comment on V1, written the way the app writes one.
  const [v1] = await copyVersions(frank.creativeId);
  const staff = await signedIn(frank.staffEmail, frank.staffPassword);
  const { data: me } = await staff.auth.getUser();
  await staff.from("comments").insert({
    creative_id: frank.creativeId,
    author_id: me.user!.id,
    body: "On the first caption",
    visibility: "public",
    copy_version_id: v1.id,
  });

  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: "Edit" }).click();

  // The latest is open and editable; an older tab is read only.
  await expect(page.getByRole("tab", { name: "V2" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".mtabbody .field > textarea.bin").first()).toHaveValue("Second caption");
  await page.getByRole("tab", { name: "V1" }).click();
  await expect(page.getByText("An earlier version, read only.")).toBeVisible();
  await expect(page.locator(".fd-d", { hasText: "First caption" })).toBeVisible();

  // V1 has a comment: explained, not offered.
  await page.getByRole("tab", { name: "V1" }).hover();
  await page.getByRole("button", { name: "Delete Version 1" }).click();
  const blocked = page.getByRole("dialog", { name: "Delete Copy Version 1?" });
  await expect(blocked).toContainText("E2E, this version has 1 comment, so it can't be deleted.");
  await expect(blocked.getByRole("button", { name: "Delete Version" })).toHaveCount(0);
  await expect(blocked.locator(".iconbtn")).toHaveCount(0);
  await blocked.getByRole("button", { name: "Close" }).click();

  // V2 has none: deleted, and the draft goes back to V1's copy.
  await page.getByRole("tab", { name: "V2" }).hover();
  await page.getByRole("button", { name: "Delete Version 2" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete Copy Version 2?" });
  await expect(confirm).toContainText("E2E, Version 2 of the copy will be gone for good.");
  await confirm.getByRole("button", { name: "Delete Version" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "V2" })).toHaveCount(0);
  await expect(page.locator(".scrim")).toHaveCount(1);
  await expect(page.locator(".mtabbody .field > textarea.bin").first()).toHaveValue("First caption");
  expect((await copyVersions(frank.creativeId)).map((v) => v.version_no)).toEqual([1]);

  // Deleting the latest frees its number: the next save is V2 again.
  await page.locator(".mtabbody .field > textarea.bin").first().fill("Third caption");
  await page.getByRole("button", { name: "Save Copy V2" }).click();
  await expect(page.getByRole("tab", { name: /^V\d$/ })).toHaveText(["V1", "V2"]);
});

test("an artwork version can be deleted from its tab", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: "Upload Artwork" }).click();
  for (const n of [1, 2]) {
    await page.locator('.mtabbody input[type="file"]').setInputFiles(await picture(page));
    // The creative's own Save (the copy section has one with the same name).
    await page.getByRole("button", { name: `Save Creative V${n}` }).click();
    await expect(page.getByText(`Saved as version ${n}.`)).toBeVisible({ timeout: 20_000 });
  }
  await page.getByRole("tab", { name: "V1" }).hover();
  await page.getByRole("button", { name: "Delete Version 1" }).click();
  await page.getByRole("dialog", { name: "Delete Creative Version 1?" }).getByRole("button", { name: "Delete Version" }).click();
  await expect(page.getByRole("tab", { name: "V1" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "V2" })).toHaveAttribute("aria-selected", "true");
  const { data } = await admin.from("creative_versions").select("version_no").eq("creative_id", frank.creativeId);
  expect(data!.map((v) => v.version_no)).toEqual([2]);
});

test("the database refuses a client, and a version with comments, but not a deleted comment", async ({ frank }) => {
  await frank.createCopyVersion(frank.creativeId, 1, { caption: "One" });
  await frank.createCopyVersion(frank.creativeId, 2, { caption: "Two" });
  const [v1, v2] = await copyVersions(frank.creativeId);

  const client = await signedIn(frank.clientEmail, frank.clientPassword);
  const asClient = await client.rpc("delete_post_version", { p_kind: "copy", p_version_id: v2.id });
  expect(asClient.error?.message).toContain("not permitted");

  const staff = await signedIn(frank.staffEmail, frank.staffPassword);
  const { data: me } = await staff.auth.getUser();
  const { data: comment } = await staff
    .from("comments")
    .insert({ creative_id: frank.creativeId, author_id: me.user!.id, body: "Note", visibility: "private", copy_version_id: v1.id })
    .select("id")
    .single();
  const blocked = await staff.rpc("delete_post_version", { p_kind: "copy", p_version_id: v1.id });
  expect(blocked.error?.message).toContain("has comments");

  // Once that comment is deleted it no longer counts.
  await admin.from("comments").update({ deleted_at: new Date().toISOString() }).eq("id", comment!.id);
  const ok = await staff.rpc("delete_post_version", { p_kind: "copy", p_version_id: v1.id });
  expect(ok.error).toBeNull();
  expect((await copyVersions(frank.creativeId)).map((v) => v.version_no)).toEqual([2]);
  const { data: kept } = await admin.from("comments").select("copy_version_id").eq("id", comment!.id).single();
  expect(kept!.copy_version_id).toBeNull();
});
