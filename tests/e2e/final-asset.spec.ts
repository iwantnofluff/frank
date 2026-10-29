import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";

// A post's final asset link (phase126, direct instruction): added in the
// Content tab, then Open Asset in the table's Creative column and under
// the post's version pickers; the team's only.
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const LINK = "https://drive.google.com/drive/folders/e2e-final-asset";

test("the team adds a final asset link; Open Asset shows in the table and on the post; removing it takes it away", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await admin.from("creatives").update({ scheduled_at: new Date().toISOString() }).eq("id", frank.creativeId);
  const saved = async () => (await admin.from("creative_asset_links").select("url").eq("creative_id", frank.creativeId).maybeSingle()).data?.url ?? null;

  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await expect(async () => {
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("tab", { name: "Content" }).click({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  const field = page.getByLabel("Link", { exact: true });
  const save = page.getByRole("button", { name: "Save Link" });
  // Not a link: said, and not saved.
  await field.fill("the drive folder");
  await expect(page.getByText("Paste the whole link, starting with https://")).toBeVisible();
  await expect(save).toBeDisabled();
  await field.fill(LINK);
  await save.click();
  await expect(page.getByText("Link saved.")).toBeVisible();
  await expect.poll(saved).toBe(LINK);
  await page.getByRole("button", { name: "Save and Close" }).click();

  // On the post, under the pickers.
  await expect(page.locator(".vselbar").getByRole("link", { name: "Open Asset" })).toHaveAttribute("href", LINK);
  // In the table's Creative column, opening in a new tab.
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  const pill = page.locator("tr[data-row]").first().getByRole("link", { name: "Open Asset" });
  await expect(pill).toHaveAttribute("href", LINK, { timeout: 20_000 });
  await expect(pill).toHaveAttribute("target", "_blank");
  // In the project's Activity Log.
  await expect
    .poll(async () => (await admin.from("project_activity").select("detail").eq("creative_id", frank.creativeId)).data!.some((r) => JSON.stringify(r.detail).includes("Final Asset")))
    .toBe(true);

  // Emptied and saved: gone.
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await expect(async () => {
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("tab", { name: "Content" }).click({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await expect(field).toHaveValue(LINK);
  await field.fill("");
  await page.getByRole("button", { name: "Remove Link" }).click();
  await expect(page.getByText("Link removed.")).toBeVisible();
  await expect.poll(saved).toBeNull();
  await page.getByRole("button", { name: "Save and Close" }).click();
  await expect(page.getByRole("link", { name: "Open Asset" })).toHaveCount(0);
});

test("a client never sees the link, in Frank or the database", async ({ page, frank }) => {
  test.setTimeout(60_000);
  await admin.from("creatives").update({ scheduled_at: new Date().toISOString() }).eq("id", frank.creativeId);
  const { error } = await admin.from("creative_asset_links").insert({ creative_id: frank.creativeId, url: LINK });
  if (error) throw error;
  await frank.loginAsClient(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await expect(page.locator(".stage-h")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Asset" })).toHaveCount(0);
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  await expect(page.locator("tr[data-row]").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("link", { name: "Open Asset" })).toHaveCount(0);
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await c.auth.signInWithPassword({ email: frank.clientEmail, password: frank.clientPassword });
  expect((await c.from("creative_asset_links").select("url").eq("creative_id", frank.creativeId)).data).toEqual([]);
});
