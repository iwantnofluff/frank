import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL, type Frank } from "./fixtures";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function staffRow(frank: Frank) {
  const { data } = await admin
    .from("users")
    .select("id, name, first_name, last_name, designation, bio, avatar_asset_id")
    .eq("email", frank.staffEmail)
    .single();
  return data!;
}

// Storage isn't swept by the fixture's teardown (it only deletes rows), so a
// spec that uploads a photo removes the file itself.
async function removePhotoFile(assetId: string | null) {
  if (!assetId) return;
  const { data } = await admin.from("assets").select("storage_key").eq("id", assetId).maybeSingle();
  if (data) await admin.storage.from("assets").remove([data.storage_key]);
}

test("Your Profile saves title-cased names and designation, whatever was typed", async ({
  page,
  frank,
}) => {
  await frank.loginAsStaff(page);
  await page.getByRole("button", { name: "Your account" }).click();
  await page.getByRole("menuitem", { name: "Your Profile" }).click();
  await page.waitForURL(`${APP_URL}/profile`);
  await expect(page.getByLabel("Email")).toHaveValue(frank.staffEmail);

  await page.getByLabel("First name").fill("");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".autherr")).toHaveText("Enter your first name");

  await page.getByLabel("First name").fill("ada");
  await page.getByLabel("Last name").fill("o'neil-smith");
  await page.getByLabel("Designation").fill("head of UX");
  await page.getByLabel(/Short bio/).fill("Ten years in brand.");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");
  await expect(page.getByLabel("First name")).toHaveValue("Ada");
  await expect(page.getByLabel("Last name")).toHaveValue("O'Neil-Smith");
  await expect(page.getByLabel("Designation")).toHaveValue("Head of UX");

  expect(await staffRow(frank)).toMatchObject({
    name: "Ada O'Neil-Smith",
    first_name: "Ada",
    last_name: "O'Neil-Smith",
    designation: "Head of UX",
    bio: "Ten years in brand.",
  });

  await page.getByRole("button", { name: "Your account" }).click();
  const menu = page.getByRole("menu", { name: "Your account" });
  await expect(menu).toContainText("Ada O'Neil-Smith");
  await expect(menu).toContainText("Head of UX");
});

test("a profile photo shows on the rail, the Team page and comments — for clients too", async ({
  page,
  browser,
  frank,
}) => {
  let assetId: string | null = null;
  // Before signing the browser in: the helper's own signOut() ends every
  // session for this user, the browser's included.
  await frank.insertCommentAsStaff("Photo check", "public");
  try {
    await frank.loginAsStaff(page);
    await page.goto(`${APP_URL}/profile`);
    await page.getByLabel("Profile photo").setInputFiles({
      name: "me.png",
      mimeType: "image/png",
      buffer: ONE_PIXEL_PNG,
    });
    await expect(page.getByRole("button", { name: "Change photo" })).toBeVisible();
    assetId = (await staffRow(frank)).avatar_asset_id;
    expect(assetId).not.toBeNull();

    const railPhoto = page.getByRole("button", { name: "Your account" }).locator("img");
    await expect(railPhoto).toBeVisible();

    await page.goto(`${APP_URL}/settings/team`);
    await expect(page.locator(".crow", { hasText: frank.staffEmail }).locator("img")).toBeVisible();

    await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
    const card = page.locator(".cmt", { hasText: "Photo check" });
    await expect(card.locator(".who img")).toBeVisible();

    const clientContext = await browser.newContext();
    const clientPage = await clientContext.newPage();
    await frank.loginAsClient(clientPage);
    await clientPage.goto(`${APP_URL}/creatives/${frank.creativeId}`);
    const clientCard = clientPage.locator(".cmt", { hasText: "Photo check" });
    await expect(clientCard.locator(".who img")).toBeVisible();
    // A real, loaded image — not just an <img> pointing at a URL the
    // client isn't allowed to fetch.
    await expect
      .poll(() => clientCard.locator(".who img").evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBe(1);
    await clientContext.close();

    await page.goto(`${APP_URL}/profile`);
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByRole("button", { name: "Upload photo" })).toBeVisible();
    await expect(railPhoto).toHaveCount(0);
    expect((await staffRow(frank)).avatar_asset_id).toBeNull();
  } finally {
    await removePhotoFile(assetId);
  }
});
