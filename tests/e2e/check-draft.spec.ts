import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";

// Draft With Frank from Check WIIFM or Check Brand (direct instruction):
// Draft with Frank opens with the check's pointers in its message box, to
// edit; Send starts a review of the copy with them. Both AI answers are
// stubbed here; real ones are checked by hand.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

test("a check's pointers open Draft with Frank, filled, and Send starts a review with them", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const { data: staff } = await admin.from("users").select("id").eq("email", frank.staffEmail).single();
  const { error } = await admin
    .from("agency_knowledge_entries")
    .insert({ agency_id: frank.agencyId, kind: "text", title: "WIIFM", body: "Lead with the reader's benefit.", created_by: staff!.id });
  if (error) throw new Error(error.message);
  await frank.createCopyVersion(frank.creativeId, 1, { caption: "Our new oat bowl is here." });
  await page.route("**/api/ai/check", (route) =>
    route.fulfill({
      json: {
        text: "TONE: WARN\nTITLE: Benefit comes late\nBODY: Lead with what the reader gets.\n---\nTONE: OK\nTITLE: Clear proof\nBODY: Protein is concrete.",
      },
    }),
  );
  const sent: Record<string, unknown>[] = [];
  await page.route("**/api/ai/copy-chat", async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({ status: 500, json: { error: "Stubbed" } });
  });

  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: /^(Upload|Update) / }).first().click();
  const modal = page.locator(".scrim .modal").first();
  await modal.getByRole("tab", { name: "Checks" }).click();
  // Brand first among the checks (direct instruction).
  const heads = await modal.locator(".msection-h").allTextContents();
  expect(heads.indexOf("Check Brand")).toBe(heads.indexOf("Check WIIFM") - 1);

  await modal.getByRole("button", { name: "Check WIIFM" }).click();
  await modal.getByRole("button", { name: "Draft With Frank" }).click();
  const chat = page.getByRole("dialog", { name: "Draft with Frank" });
  const box = chat.getByRole("textbox", { name: "Message to Frank" });
  // Only what needs acting on.
  await expect(box).toHaveValue(
    "Write a better version of my copy using these pointers from Check WIIFM, keeping what already works:\n- Benefit comes late: Lead with what the reader gets.",
  );
  await box.press("ControlOrMeta+a");
  await box.fill("Make it lead with the benefit.");
  await chat.getByRole("button", { name: "Send" }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatchObject({ creativeId: frank.creativeId, mode: "review", scope: "copy", message: "Make it lead with the benefit." });
  // Not answered: the words go back in the box.
  await expect(box).toHaveValue("Make it lead with the benefit.");
});
