import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { test, expect, APP_URL } from "./fixtures";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// A plain coloured picture of the given size, made in the browser.
async function picture(page: Page, width: number, height: number) {
  const b64 = await page.evaluate(
    ([w, h]) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d")!;
      g.fillStyle = "#0f766e";
      g.fillRect(0, 0, w, h);
      return c.toDataURL("image/png").split(",")[1];
    },
    [width, height],
  );
  return { name: `logo-${width}x${height}.png`, mimeType: "image/png", buffer: Buffer.from(b64, "base64") };
}

// Client Settings → Client Details, from the client's page, with its
// details turned into fields (phase48).
async function openEditClient(page: Page) {
  // The row's arrow went (direct instruction): the client's page, then
  // its Settings in the rail.
  await page.locator(".crow", { hasText: "E2E Test Client" }).click();
  await page.getByRole("link", { name: "E2E Test Client Settings" }).click();
  await page.waitForURL(/\/settings\/details$/);
  const details = page.locator(".setmain");
  await details.getByRole("button", { name: "Edit", exact: true }).click();
  return details;
}

// Saved in place: the fields go, then back to the clients list.
async function saveAndClose(details: ReturnType<Page["locator"]>) {
  await details.getByRole("button", { name: "Save" }).click();
  await expect(details.locator("#cName")).toHaveCount(0);
  await details.page().goto(`${APP_URL}/dashboard`);
}

test("a client gets a square profile image and a description", async ({ page, frank }) => {
  // Many steps across several pages (and, for some, a second session) —
  // past the 30s default when the whole suite is running in parallel.
  test.setTimeout(60_000);
  let storageKey: string | null = null;
  try {
    await frank.loginAsStaff(page);
    await page.goto(`${APP_URL}/dashboard`);
    await expect(page.locator("button.chip", { hasText: "Active" })).toHaveText("Active (1)");
    await expect(page.locator("button.chip", { hasText: "Archived" })).toHaveText("Archived (0)");

    let modal = await openEditClient(page);
    await modal.getByLabel(/Description/).fill("Organic skincare brand we've run social for since 2024.");

    // Any shape opens the cropper (no face detection for a client); only the
    // square chosen there is kept.
    await modal.getByLabel("Client profile image").setInputFiles(await picture(page, 600, 400));
    const cropper = page.getByRole("dialog", { name: "Position the client's image" });
    await expect(cropper.getByRole("status")).toHaveText("Drag and zoom to frame the square that's kept.");
    // Escape closes the cropper only — the client edits underneath survive.
    await page.keyboard.press("Escape");
    await expect(cropper).toHaveCount(0);
    await expect(modal).toBeVisible();
    await expect(modal.getByLabel(/Description/)).toHaveValue("Organic skincare brand we've run social for since 2024.");

    await modal.getByLabel("Client profile image").setInputFiles(await picture(page, 600, 400));
    await cropper.getByRole("button", { name: "Use image" }).click();
    await expect(cropper).toHaveCount(0);
    await expect(modal.locator(".logo.clogo img")).toBeVisible();
    await saveAndClose(modal);

    const { data: c } = await admin
      .from("clients")
      .select("logo_asset_id, description")
      .eq("id", frank.clientId)
      .single();
    expect(c!.description).toBe("Organic skincare brand we've run social for since 2024.");
    const { data: asset } = await admin
      .from("assets")
      .select("storage_key, mime_type")
      .eq("id", c!.logo_asset_id)
      .single();
    storageKey = asset!.storage_key;
    expect(asset!.mime_type).toBe("image/png");
    expect(storageKey).toMatch(new RegExp(`^${frank.agencyId}/client-logos/${frank.clientId}/`));

    const listLogo = page.locator(".crow", { hasText: "E2E Test Client" }).locator(".logo img");
    await expect(listLogo).toBeVisible();
    await expect.poll(() => listLogo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(512);

    await page.goto(`${APP_URL}/clients/${frank.clientId}`);
    await expect(page.locator(".pad > .sub").first()).toHaveText(
      "Organic skincare brand we've run social for since 2024.",
    );

    await page.goto(`${APP_URL}/dashboard`);
    modal = await openEditClient(page);
    await modal.getByRole("button", { name: "Remove" }).click();
    await saveAndClose(modal);
    await expect(page.locator(".crow", { hasText: "E2E Test Client" }).locator(".logo img")).toHaveCount(0);
    const { data: after } = await admin.from("clients").select("logo_asset_id").eq("id", frank.clientId).single();
    expect(after!.logo_asset_id).toBeNull();
  } finally {
    if (storageKey) await admin.storage.from("assets").remove([storageKey]);
  }
});

test("a project moves to another client, leaving its folder behind and its share links off", async ({
  page,
  frank,
}) => {
  // Many steps across several pages (and, for some, a second session) —
  // past the 30s default when the whole suite is running in parallel.
  test.setTimeout(60_000);
  const { data: other } = await admin
    .from("clients")
    .insert({ agency_id: frank.agencyId, name: "Second Client" })
    .select("id")
    .single();
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  const { data: folder } = await admin
    .from("project_folders")
    .insert({ client_id: frank.clientId, name: "Spring", created_by: staffId })
    .select("id")
    .single();
  await admin.from("projects").update({ folder_id: folder!.id }).eq("id", frank.projectId);
  const token = await frank.createSharedLink();

  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/clients/${frank.clientId}`);
  const row = page.locator(".crow", { hasText: "E2E Test Project" });
  await expect(row).toContainText("Active");
  // The project's profile opens from its own page (direct instruction).
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  await page.getByRole("button", { name: "Project options" }).click();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("dialog", { name: "E2E Test Project" }).getByRole("button", { name: "Move to Client" }).click();
  const modal = page.getByRole("dialog", { name: "Move E2E Test Project to another client" });
  await expect(modal.getByRole("radio")).toHaveCount(1);
  await modal.getByRole("radio", { name: "Second Client" }).click();
  await modal.getByRole("button", { name: "Move" }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Moved" })).toHaveText("Moved “E2E Test Project” to Second Client.");
  await page.goto(`${APP_URL}/clients/${frank.clientId}`);
  await expect(page.locator(".crow.folder-band", { hasText: "Spring" })).toBeVisible();
  await expect(page.locator(".crow", { hasText: "E2E Test Project" })).toHaveCount(0);
  // The folder it left stays, now empty, for the user to delete if they want.
  await expect(page.locator(".crow.folder-band", { hasText: "Spring" })).toBeVisible();

  const { data: p } = await admin
    .from("projects")
    .select("client_id, folder_id")
    .eq("id", frank.projectId)
    .single();
  expect(p).toEqual({ client_id: other!.id, folder_id: null });
  const { data: link } = await admin.from("shared_links").select("revoked_at").eq("token", token).single();
  expect(link!.revoked_at).not.toBeNull();

  await page.goto(`${APP_URL}/clients/${other!.id}`);
  await expect(page.locator(".crow", { hasText: "E2E Test Project" })).toBeVisible();
});
