import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL, type Frank } from "./fixtures";

// Deleting an archived client or project for good (phase74, decided
// directly): Owners and the Primary Owner only, archived first, confirmed by
// typing the name; everything under it goes, files too; a client's own
// people lose access, their logins stay.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

async function withArtwork(frank: Frank) {
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  const path = `${frank.agencyId}/${frank.creativeId}/${crypto.randomUUID()}-art.png`;
  await admin.storage.from("assets").upload(path, PNG, { contentType: "image/png" });
  const { data: asset } = await admin
    .from("assets")
    .insert({ agency_id: frank.agencyId, storage_key: path, filename: "art.png", mime_type: "image/png", bytes: PNG.length, created_by: staffId })
    .select("id")
    .single();
  await admin.from("creative_versions").insert({ creative_id: frank.creativeId, version_no: 1, asset_id: asset!.id, created_by: staffId });
  await frank.insertCommentAsStaff("A note on it", "public");
  return { path, assetId: asset!.id as string };
}
async function setRole(frank: Frank, role: string) {
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  const { data } = await admin.from("memberships").update({ role }).eq("agency_id", frank.agencyId).is("client_id", null).eq("user_id", staffId).select("id");
  if (!data?.length) throw new Error("role not changed");
}
const fileExists = async (path: string) => {
  const [folder, name] = [path.slice(0, path.lastIndexOf("/")), path.slice(path.lastIndexOf("/") + 1)];
  const { data } = await admin.storage.from("assets").list(folder, { search: name });
  return (data ?? []).some((f) => f.name === name);
};

test("an Owner deletes an archived client and everything in it, typing its name", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const art = await withArtwork(frank);
  await frank.loginAsStaff(page);

  // An Admin can't, whatever they try.
  const tryDelete = () => page.request.post(`${APP_URL}/api/delete-permanently`, { data: { kind: "client", id: frank.clientId } });
  expect((await tryDelete()).status()).toBe(403);

  // An Owner can't while it's still active.
  await setRole(frank, "owner");
  expect((await tryDelete()).status()).toBe(409);

  await admin.from("clients").update({ archived_at: new Date().toISOString() }).eq("id", frank.clientId);
  await page.goto(`${APP_URL}/clients/${frank.clientId}/settings/details`);
  await page.getByRole("button", { name: "Delete Permanently" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete E2E Test Client for good?" });
  await expect(dialog).toContainText("1 project");
  await expect(dialog).toContainText("1 post");
  await expect(dialog).toContainText("1 file");
  await expect(dialog).toContainText("1 person at the client loses access");
  const del = dialog.getByRole("button", { name: "Delete Permanently" });
  await expect(del).toBeDisabled();
  await dialog.getByLabel("Name to confirm").fill("E2E Test Client");
  await del.click();
  await page.waitForURL(`${APP_URL}/dashboard`);

  // Gone: the client, its project, post, comments, versions, asset and file.
  expect((await admin.from("clients").select("id").eq("id", frank.clientId)).data).toHaveLength(0);
  expect((await admin.from("projects").select("id").eq("id", frank.projectId)).data).toHaveLength(0);
  expect((await admin.from("creatives").select("id").eq("id", frank.creativeId)).data).toHaveLength(0);
  expect((await admin.from("comments").select("id").eq("creative_id", frank.creativeId)).data).toHaveLength(0);
  expect((await admin.from("assets").select("id").eq("id", art.assetId)).data).toHaveLength(0);
  expect(await fileExists(art.path)).toBe(false);
  // Its person lost access; their login is still there.
  const clientUser = (await admin.from("users").select("id").eq("email", frank.clientEmail).single()).data;
  expect(clientUser).not.toBeNull();
  expect((await admin.from("memberships").select("id").eq("agency_id", frank.agencyId).eq("user_id", clientUser!.id)).data).toHaveLength(0);
});

test("an Owner deletes an archived project from its profile window", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const art = await withArtwork(frank);
  await setRole(frank, "owner");
  await admin.from("projects").update({ archived_at: new Date().toISOString() }).eq("id", frank.projectId);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/clients/${frank.clientId}`);
  await page.getByRole("button", { name: /Archived/ }).click();
  await page.getByRole("button", { name: "Open E2E Test Project's profile" }).click();
  await page.getByRole("button", { name: "Delete Permanently" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete E2E Test Project for good?" });
  await dialog.getByLabel("Name to confirm").fill("E2E Test Project");
  await dialog.getByRole("button", { name: "Delete Permanently" }).click();
  await expect(dialog).toHaveCount(0);
  expect((await admin.from("projects").select("id").eq("id", frank.projectId)).data).toHaveLength(0);
  expect((await admin.from("clients").select("id").eq("id", frank.clientId)).data).toHaveLength(1);
  expect(await fileExists(art.path)).toBe(false);
});
