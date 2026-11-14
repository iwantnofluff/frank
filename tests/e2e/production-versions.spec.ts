import { createClient } from "@supabase/supabase-js";
import { test, expect, goToMonth } from "./fixtures";

// The Production tab's words in versions (phase120, direct instruction):
// each field its own, Save to V{n} or Save as V{n+1}, earlier ones read
// only; the post keeps the latest; the table shows the V and earlier ones.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

test("the VO saves into its current version or as a new one, the post keeping the latest", async ({ page, frank }) => {
  test.setTimeout(120_000);
  await admin.from("creatives").update({ format: "ig_reel", formats: ["ig_reel"] }).eq("id", frank.creativeId);
  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const modal = page.locator(".scrim .modal").first();
  await modal.getByRole("tab", { name: "Production" }).click();
  const vo = modal.getByLabel("VO", { exact: true });

  await vo.fill("Pour it slow.");
  await modal.getByRole("button", { name: "Save VO V1" }).click();
  await expect(modal.getByText("Saved as V1.")).toBeVisible({ timeout: 15_000 });
  await vo.fill("Pour it slower.");
  await modal.getByRole("button", { name: "Save to V1" }).click();
  await expect(modal.getByText("Saved to V1.")).toBeVisible({ timeout: 15_000 });
  await vo.fill("Let it bloom.");
  await modal.getByRole("button", { name: "Save as V2" }).click();
  await expect(modal.getByText("Saved as V2.")).toBeVisible({ timeout: 15_000 });

  const rows = (await admin.from("production_versions").select("field, version_no, body").eq("creative_id", frank.creativeId).order("version_no")).data;
  expect(rows).toEqual([
    { field: "voiceover", version_no: 1, body: "Pour it slower." },
    { field: "voiceover", version_no: 2, body: "Let it bloom." },
  ]);
  expect((await admin.from("creatives").select("voiceover").eq("id", frank.creativeId).single()).data!.voiceover).toBe("Let it bloom.");

  // V1 read only, in its tab.
  await modal.getByRole("tab", { name: "V1" }).first().click();
  await expect(modal.getByText("An earlier version, read only.")).toBeVisible();
  await expect(modal.getByText("Pour it slower.")).toBeVisible();
  await page.keyboard.press("Escape");

  // The table: V2, and one earlier.
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty", { timeout: 60_000 });
  await goToMonth(page, "March 2027");
  const row = page.locator("tr[data-row]", { hasText: "E2E Test Creative" });
  const cell = row.locator("td", { hasText: "Let it bloom." });
  await expect(cell.locator(".cc-v")).toHaveText("V2", { timeout: 15_000 });
  await expect(cell.getByText("+1 earlier")).toBeVisible();
});

// Each version has the copy's × (direct instruction), shown on its tab's
// hover as the copy's is: asked first; an
// earlier one simply goes; the latest gone puts the one before it back on
// the post and in the editor; the only one gone leaves none.
test("a VO or Text on Image version can be deleted from its tab, as the copy's can", async ({ page, frank }) => {
  test.setTimeout(120_000);
  await admin.from("creatives").update({ format: "ig_reel", formats: ["ig_reel"] }).eq("id", frank.creativeId);
  const { data: c } = await admin.from("creatives").select("agency_id").eq("id", frank.creativeId).single();
  await admin.from("production_versions").insert(
    ["One", "Two", "Three"].map((body, i) => ({ creative_id: frank.creativeId, agency_id: c!.agency_id, field: "voiceover", version_no: i + 1, body })),
  );
  await admin.from("production_versions").insert([
    { creative_id: frank.creativeId, agency_id: c!.agency_id, field: "slide_text", version_no: 1, slides: ["First words"] },
    { creative_id: frank.creativeId, agency_id: c!.agency_id, field: "slide_text", version_no: 2, slides: ["Second words"] },
  ]);
  await admin.from("creatives").update({ voiceover: "Three", slide_text: ["Second words"] }).eq("id", frank.creativeId);
  const post = async () => (await admin.from("creatives").select("voiceover, slide_text").eq("id", frank.creativeId).single()).data!;

  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const modal = page.locator(".scrim .modal").first();
  await modal.getByRole("tab", { name: "Production" }).click();
  const voTabs = modal.getByRole("tablist", { name: "VO versions" });
  await expect(voTabs.getByRole("tab")).toHaveText(["V1", "V2", "V3"]);
  const vo = modal.getByLabel("VO", { exact: true });
  await expect(vo).toHaveValue("Three");
  const confirm = page.getByRole("dialog", { name: /^Delete VO Version/ });

  // An earlier one: just it.
  await voTabs.getByRole("tab", { name: "V2" }).hover();
  await voTabs.getByRole("button", { name: "Delete Version 2" }).click();
  await expect(confirm).toContainText("Version 2 of the VO will be gone for good.");
  await confirm.getByRole("button", { name: "Delete Version" }).click();
  await expect(voTabs.getByRole("tab")).toHaveText(["V1", "V3"]);
  expect((await post()).voiceover).toBe("Three");

  // The latest: the post and the editor go back to the one before.
  await voTabs.getByRole("tab", { name: "V3" }).hover();
  await voTabs.getByRole("button", { name: "Delete Version 3" }).click();
  await expect(confirm).toContainText("It's the latest, so the post goes back to the one before it.");
  await confirm.getByRole("button", { name: "Delete Version" }).click();
  await expect(voTabs.getByRole("tab")).toHaveText(["V1"]);
  await expect(vo).toHaveValue("One");
  await expect.poll(async () => (await post()).voiceover).toBe("One");

  // The only one: none left.
  await voTabs.getByRole("tab", { name: "V1" }).hover();
  await voTabs.getByRole("button", { name: "Delete Version 1" }).click();
  await expect(confirm).toContainText("It's the only one, so the post will have none.");
  await confirm.getByRole("button", { name: "Delete Version" }).click();
  await expect(voTabs).toHaveCount(0);
  await expect(vo).toHaveValue("");
  await expect.poll(async () => (await post()).voiceover).toBeNull();

  // Text on Image the same: its latest gone, the one before is back.
  const toiTabs = modal.getByRole("tablist", { name: "Text on Image versions" });
  await expect(toiTabs.getByRole("tab")).toHaveText(["V1", "V2"]);
  await toiTabs.getByRole("tab", { name: "V2" }).hover();
  await toiTabs.getByRole("button", { name: "Delete Version 2" }).click();
  await page.getByRole("dialog", { name: "Delete Text on Image Version 2?" }).getByRole("button", { name: "Delete Version" }).click();
  await expect(toiTabs.getByRole("tab")).toHaveText(["V1"]);
  await expect.poll(async () => (await post()).slide_text).toEqual(["First words"]);
  expect((await admin.from("production_versions").select("field, version_no").eq("creative_id", frank.creativeId)).data).toEqual([
    { field: "slide_text", version_no: 1 },
  ]);
});

// The VO, Text on Image and Caption boxes (direct instruction): one height
// for all three, half again the VO's old 123px, whatever their length.
test("the VO, Text on Image and Caption boxes share one taller height", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const long = Array.from({ length: 20 }, (_, i) => `Line ${i + 1} of a long script.`).join("\n");
  await admin.from("creatives").update({ format: "ig_reel", formats: ["ig_reel"], voiceover: long, slide_text: ["Short words"] }).eq("id", frank.creativeId);
  await frank.loginAsStaff(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const modal = page.locator(".scrim .modal").first();
  await modal.getByRole("tab", { name: "Production" }).click();
  const height = (l: ReturnType<typeof modal.locator>) => l.evaluate((el) => (el as HTMLElement).offsetHeight);
  expect(await height(modal.locator("#nbVo"))).toBe(185);
  expect(await height(modal.locator('[data-focus="imageOnText"] textarea').first())).toBe(185);
  await modal.getByRole("tab", { name: "Content" }).click();
  const caption = modal.locator(".field", { has: page.locator("label", { hasText: /^Caption$/ }) }).locator("textarea");
  await expect(caption).toBeVisible();
  expect(await height(caption)).toBe(185);
});
