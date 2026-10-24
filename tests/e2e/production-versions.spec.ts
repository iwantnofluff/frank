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
