import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL, type Frank } from "./fixtures";

// A video post's VO (phase88): its own section after the Creative in the
// post's window, saved on the post with its own Save, a VO column on the
// table (the team's only), and a field Draft with Frank can fill.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function makeVideo(frank: Frank) {
  const { error } = await admin
    .from("creatives")
    .update({ format: "ig_reel", formats: ["ig_reel"], slide_count: null, scheduled_at: new Date().toISOString() })
    .eq("id", frank.creativeId);
  if (error) throw new Error(error.message);
}

test("a video post has a VO after its Creative, saved on the post and shown on the table", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await makeVideo(frank);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: "Upload Artwork" }).click();
  const modal = page.locator(".scrim .modal").first();

  // Creative, then VO, then Text on Image.
  const heads = await modal.locator(".msection-h").allTextContents();
  expect(heads.indexOf("VO")).toBe(heads.indexOf("Creative") + 1);
  expect(heads.indexOf("Text on Image")).toBe(heads.indexOf("VO") + 1);

  const vo = modal.getByLabel("VO", { exact: true });
  await vo.fill("Nobody misses on purpose.");
  // Unsaved, the window won't close on it.
  await expect(modal.getByRole("button", { name: "Save and Close" })).toBeDisabled();
  await modal.getByRole("button", { name: "Save VO" }).click();
  await expect(modal.getByRole("button", { name: "Save VO" })).toBeDisabled();
  await expect(modal.getByText("Saved.")).toBeVisible();
  await expect(modal.getByRole("button", { name: "Save and Close" })).toBeEnabled();

  // On the post itself, not a copy version; the log names it.
  const { data: c } = await admin.from("creatives").select("voiceover").eq("id", frank.creativeId).single();
  expect(c!.voiceover).toBe("Nobody misses on purpose.");
  expect((await admin.from("copy_versions").select("id").eq("creative_id", frank.creativeId)).data).toEqual([]);
  await expect
    .poll(async () => (await admin.from("project_activity").select("detail").eq("creative_id", frank.creativeId).eq("kind", "post_edited")).data?.map((r) => r.detail.fields))
    .toContainEqual(["VO"]);

  // The table's VO column.
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  const row = page.locator("tr[data-row]").first();
  await expect(row).toBeVisible();
  // Shown once the page knows it's the team (as the checkbox column is).
  await expect(page.locator("th", { hasText: /^VO/ })).toHaveCount(1);
  const voCol = await page.locator("th").evaluateAll((ths) => ths.findIndex((th) => /^VO/.test(th.textContent ?? "")));
  expect(voCol).toBeGreaterThan(0);
  await expect(row.locator("td").nth(voCol)).toHaveText("Nobody misses on purpose.");
});

test("a post with no video format has no VO, and a client's table has no VO column", async ({ page, frank }) => {
  await admin.from("creatives").update({ scheduled_at: new Date().toISOString() }).eq("id", frank.creativeId);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: "Upload Artwork" }).click();
  const modal = page.locator(".scrim .modal").first();
  await expect(modal.locator(".msection-h", { hasText: "Text on Image" })).toBeVisible();
  await expect(modal.locator(".msection-h", { hasText: /^VO$/ })).toHaveCount(0);

  const client = await page.context().browser()!.newContext();
  const cp = await client.newPage();
  await frank.loginAsClient(cp);
  await cp.goto(`${APP_URL}/projects/${frank.projectId}`);
  await cp.waitForSelector(".tbl th");
  await expect(cp.locator("th", { hasText: /^Text on Image/ })).toHaveCount(1);
  await expect(cp.locator("th", { hasText: /^VO/ })).toHaveCount(0);
  await client.close();
});

test("Draft with Frank offers a VO with its own Use This", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await makeVideo(frank);
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  const { data: chat } = await admin
    .from("copy_chats")
    .insert({ creative_id: frank.creativeId, mode: "draft", created_by: staffId })
    .select("id")
    .single();
  await admin.from("copy_chat_messages").insert([
    { chat_id: chat!.id, role: "user", body: "Draft.", drafts: [], created_by: staffId },
    {
      chat_id: chat!.id,
      role: "assistant",
      body: "One angle.",
      created_by: null,
      drafts: [{ label: "Calm", fields: { caption: "Daily dessert.", voiceover: "Something sweet, every day." } }],
    },
  ]);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: "Upload Artwork" }).click();
  const modal = page.locator(".scrim .modal").first();
  await modal.getByRole("button", { name: "Draft with Frank" }).click();
  const dialog = page.getByRole("dialog", { name: "Draft with Frank" });
  await dialog.getByRole("button", { name: /Drafted from the concept/ }).click();
  await dialog.getByRole("button", { name: "Use This for VO" }).click();
  await expect(dialog.getByRole("button", { name: "Added: VO" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal.getByLabel("VO", { exact: true })).toHaveValue("Something sweet, every day.");
  // Into the editor only: saved when the person saves it.
  expect((await admin.from("creatives").select("voiceover").eq("id", frank.creativeId).single()).data!.voiceover).toBeNull();
});
