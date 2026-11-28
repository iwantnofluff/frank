import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";

// Check Brand keeps its last saved check (phase174, direct instruction):
// Save after a run, shown again as the window opens with the copy version it
// was checked against, and a note once the copy has changed since. Never a
// live AI answer here: the check is stubbed.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ANSWER = "TONE: WARN\nTITLE: Too shouty\nBODY: Drop the capitals.\n---\nTONE: OK\nTITLE: On tone\nBODY: Warm and plain.";

test("Check Brand saves, shows the saved check again, and says when the copy has changed", async ({ page, frank }) => {
  test.setTimeout(120_000);
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  await admin.from("knowledge_entries").insert({ agency_id: frank.agencyId, client_id: frank.clientId, section: "tone", kind: "text", title: "Voice", body: "Warm and plain.", author_id: staffId });
  await frank.createCopyVersion(frank.creativeId, 1, { caption: "BUY IT NOW" });
  await page.route("**/api/ai/check", (r) => r.fulfill({ json: { text: ANSWER } }));

  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}?edit=checks`);
  const modal = page.locator(".scrim .modal").first();
  await expect(modal.getByRole("tab", { name: "Checks" })).toHaveAttribute("aria-selected", "true", { timeout: 20_000 });
  const brand = modal.locator(".field", { has: page.getByRole("button", { name: "Check Brand", exact: true }) });
  await brand.getByRole("button", { name: "Check Brand", exact: true }).click();
  await expect(brand).toContainText("Too shouty");
  // Not saved until Save.
  expect((await admin.from("brand_checks").select("creative_id").eq("creative_id", frank.creativeId)).data).toEqual([]);
  await expect(brand.getByRole("button", { name: "Share to Slack" })).toBeDisabled();
  await brand.getByRole("button", { name: "Save" }).click();
  await expect(brand.getByRole("button", { name: "Save" })).toHaveCount(0);
  await expect
    .poll(async () => (await admin.from("brand_checks").select("copy_version_no, findings").eq("creative_id", frank.creativeId).maybeSingle()).data)
    .toEqual({
      copy_version_no: 1,
      findings: [
        { tone: "warn", title: "Too shouty", body: "Drop the capitals." },
        { tone: "ok", title: "On tone", body: "Warm and plain." },
      ],
    });

  // Opened again: the saved check, against copy V1.
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}?edit=checks&check=brand`);
  await expect(modal).toContainText(/Saved \d{1,2} [A-Z][a-z]{2}, checked against copy V1\./, { timeout: 20_000 });
  await expect(modal).toContainText("Too shouty");
  await expect(modal).not.toContainText("The copy has changed since");

  // New copy: it says so.
  await frank.createCopyVersion(frank.creativeId, 2, { caption: "Warm and plain, now." });
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}?edit=checks&check=brand`);
  await expect(modal).toContainText("The copy has changed since: check it again to see it as it is now.", { timeout: 20_000 });
});
