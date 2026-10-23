import { createClient } from "@supabase/supabase-js";
import { test, expect, goToMonth } from "./fixtures";

// Notes for Designer in versions (phase117, direct instruction): Save to
// V{n} changes the latest, Save as V{n+1} adds one; earlier ones read only;
// the table shows the latest with its V and headings, earlier on hover.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

test("notes save to the current version or as a new one, and the table shows the latest", async ({ page, frank }) => {
  test.setTimeout(120_000);
  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("tab", { name: "Brief" }).click();

  const notes = page.locator("#nbNotes");
  await notes.fill("Layout: Cup centred\nGuardrails:\n- No big logo");
  await page.getByRole("button", { name: "Save Notes V1" }).click();
  await expect(page.getByText("Saved as V1.")).toBeVisible({ timeout: 15_000 });

  // Shown with headings once saved; clicked, the text to change.
  await expect(page.locator(".notesview .nt-h")).toHaveText(["Layout", "Guardrails"]);
  await page.locator(".notesview").click();
  await page.locator("textarea#nbNotes").fill("Layout: Cup centred, steam rising\nGuardrails:\n- No big logo");
  await page.getByRole("button", { name: "Save to V1" }).click();
  await expect(page.getByText("Saved to V1.")).toBeVisible({ timeout: 15_000 });

  await page.locator(".notesview").click();
  await page.locator("textarea#nbNotes").fill("Layout: Cup to the left\nStyle: Warm film grain");
  await page.getByRole("button", { name: "Save as V2" }).click();
  await expect(page.getByText("Saved as V2.")).toBeVisible({ timeout: 15_000 });

  const rows = (await admin.from("designer_note_versions").select("version_no, overall, edited_at").eq("creative_id", frank.creativeId).order("version_no")).data!;
  expect(rows.map((r) => [r.version_no, r.overall, !!r.edited_at])).toEqual([
    [1, "Layout: Cup centred, steam rising\nGuardrails:\n- No big logo", true],
    [2, "Layout: Cup to the left\nStyle: Warm film grain", false],
  ]);

  // V1 read only.
  await page.getByRole("tab", { name: "V1" }).click();
  await expect(page.getByText("An earlier version, read only.")).toBeVisible();
  await expect(page.locator(".notesview.ro")).toContainText("steam rising");
  await expect(page.getByRole("button", { name: /^Save (to|as) V/ })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // The table: V2, its headings, and one earlier.
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  const row = page.locator("tr[data-row]", { hasText: "E2E Test Creative" });
  await expect(row.locator(".cc-v", { hasText: "V2" })).toBeVisible({ timeout: 15_000 });
  await expect(row.locator(".nt-h").first()).toHaveText("Layout");
  await expect(row.getByText("+1 earlier")).toBeVisible();
});
