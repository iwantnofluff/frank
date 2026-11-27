import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL, type Frank } from "./fixtures";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
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

test("My Profile saves title-cased names and designation, whatever was typed", async ({
  page,
  frank,
}) => {
  await frank.loginAsStaff(page);
  await page.getByRole("button", { name: "Your account" }).click();
  await page.getByRole("menuitem", { name: "My Profile" }).click();
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
  // Many steps across several pages (and, for some, a second session) —
  // past the 30s default when the whole suite is running in parallel.
  test.setTimeout(60_000);
  let assetId: string | null = null;
  // Before signing the browser in: the helper's own signOut() ends every
  // session for this user, the browser's included.
  await frank.insertCommentAsStaff("Photo check", "public");
  try {
    await frank.loginAsStaff(page);
    await page.goto(`${APP_URL}/profile`);
    // A real-sized picture (no face in it), so drag and zoom have room to move.
    const picture = await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 600;
      c.height = 400;
      const g = c.getContext("2d")!;
      const grad = g.createLinearGradient(0, 0, 600, 400);
      grad.addColorStop(0, "#2563eb");
      grad.addColorStop(1, "#f59e0b");
      g.fillStyle = grad;
      g.fillRect(0, 0, 600, 400);
      return c.toDataURL("image/png").split(",")[1];
    });
    await page.getByLabel("Profile photo").setInputFiles({
      name: "me.png",
      mimeType: "image/png",
      buffer: Buffer.from(picture, "base64"),
    });
    const cropper = page.getByRole("dialog", { name: "Position your photo" });
    await expect(cropper.getByRole("status")).toHaveText(/Couldn't spot a face/, { timeout: 30000 });
    // Dragging moves the photo under the circle.
    const photoInCrop = cropper.locator(".pcrop img");
    const before = await photoInCrop.evaluate((el) => (el as HTMLElement).style.transform);
    await cropper.getByRole("slider", { name: "Zoom" }).fill("80");
    const zoomed = await photoInCrop.evaluate((el) => (el as HTMLElement).style.transform);
    const area = await cropper.locator(".pcrop").boundingBox();
    await page.mouse.move(area!.x + 140, area!.y + 140);
    await page.mouse.down();
    await page.mouse.move(area!.x + 100, area!.y + 110, { steps: 5 });
    await page.mouse.up();
    const dragged = await photoInCrop.evaluate((el) => (el as HTMLElement).style.transform);
    expect(zoomed).not.toBe(before);
    expect(dragged).not.toBe(zoomed);
    await cropper.getByRole("button", { name: "Use photo" }).click();
    await expect(cropper).toHaveCount(0);

    // A real upload to storage — slower than the 5s default under a full
    // parallel suite.
    await expect(page.getByRole("button", { name: "Change photo" })).toBeVisible({ timeout: 20_000 });
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
    // client isn't allowed to fetch — and it's the cropper's 512 px square,
    // not the 600x400 original.
    await expect
      .poll(() => clientCard.locator(".who img").evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBe(512);
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

// A client's own people upload a photo too (reported directly: it failed
// with "new row violates row-level security policy"). Only into their own
// avatar folder (phase169): not someone else's, nor a post's.
test("a client uploads their own profile photo, and only into their own folder", async ({ page, frank }) => {
  test.setTimeout(60_000);
  const clientRow = async () =>
    (await admin.from("users").select("id, avatar_asset_id").eq("email", frank.clientEmail).single()).data!;
  let assetId: string | null = null;
  try {
    await frank.loginAsClient(page);
    await page.goto(`${APP_URL}/profile`);
    const picture = await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 400;
      c.height = 400;
      const g = c.getContext("2d")!;
      g.fillStyle = "#16a34a";
      g.fillRect(0, 0, 400, 400);
      return c.toDataURL("image/png").split(",")[1];
    });
    await page.getByLabel("Profile photo").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: Buffer.from(picture, "base64") });
    const cropper = page.getByRole("dialog", { name: "Position your photo" });
    await cropper.getByRole("button", { name: "Use photo" }).click();
    await expect(page.getByRole("button", { name: "Change photo" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("row-level security")).toHaveCount(0);
    assetId = (await clientRow()).avatar_asset_id;
    expect(assetId).not.toBeNull();

    // Through the client's own session: refused anywhere but their folder.
    const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    await c.auth.signInWithPassword({ email: frank.clientEmail, password: frank.clientPassword });
    const staffId = (await staffRow(frank)).id;
    const blob = new Blob([Buffer.from(picture, "base64")], { type: "image/png" });
    for (const path of [`${frank.agencyId}/avatars/${staffId}/x.png`, `${frank.agencyId}/${frank.creativeId}/x.png`]) {
      const { error } = await c.storage.from("assets").upload(path, blob, { contentType: "image/png" });
      expect(error, path).not.toBeNull();
    }
    await c.auth.signOut();
  } finally {
    await removePhotoFile(assetId);
    if (assetId) await admin.from("users").update({ avatar_asset_id: null }).eq("email", frank.clientEmail);
  }
});
