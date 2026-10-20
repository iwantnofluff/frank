import { createClient } from "@supabase/supabase-js";
import { test, expect } from "./fixtures";

// Design with Frank (phase110) and what it fills: a reference image
// pasted into the Brief (phase111), a direction's Use This filling Notes
// for Designer, and both kept from a Client (phase112). No live AI: the
// direction is seeded as the team would write it.

const signedIn = async (email: string, password: string) => {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
};

// A 1×1 PNG.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("a pasted reference image, and a direction into Notes for Designer, for the team only", async ({ page, browser, frank }) => {
  const staff = await signedIn(frank.staffEmail, frank.staffPassword);
  const { data: me } = await staff.auth.getUser();
  const { error: seedError } = await staff.from("design_directions").insert({
    creative_id: frank.creativeId,
    created_by: me.user!.id,
    body: {
      summary: "Make it warm.",
      references: [],
      worked: [],
      directions: [
        { title: "Steam", idea: "Steam rising off the cup", layout: "Cup centred", style: "", palette: "Browns", textOnImage: "", slides: [], reel: null },
      ],
      guardrails: { format: ["4:5"], client: [], avoid: ["A big logo"] },
    },
  });
  expect(seedError).toBeNull();

  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("tab", { name: "Brief" }).click();

  // Pasted into the box under the links.
  const box = page.locator(".refimg-drop");
  await box.click();
  await box.evaluate((el, b64) => {
    const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "ref.png", { type: "image/png" }));
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, PNG);
  await expect(page.locator(".refimg img")).toHaveCount(1, { timeout: 15_000 });
  await expect.poll(async () => (await staff.from("reference_images").select("id").eq("creative_id", frank.creativeId)).data?.length).toBe(1);

  // Design with Frank, from the footer: the seeded direction's Use This
  // fills Notes for Designer with it and its guardrails; Update saves it.
  await page.getByRole("button", { name: "Design with Frank" }).click();
  await page.getByRole("button", { name: "Use This: Steam" }).click();
  await expect(page.getByRole("button", { name: "Added: Steam" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).last().click();
  await expect(page.locator("#nbNotes")).toHaveValue(/^Steam: Steam rising off the cup[\s\S]*Guardrails:\n- 4:5\n- A big logo$/);
  await page.getByRole("button", { name: "Update" }).click();
  await expect(page.getByText("Post updated.")).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Brief" }).first().click();
  await expect(page.locator(".bsec", { hasText: "Notes for Designer" })).toContainText("Steam rising off the cup");

  // A Client: on the post, no Notes for Designer; in the database, none
  // of the image, the notes or the direction.
  const ctx = await browser.newContext();
  const clientPage = await ctx.newPage();
  await frank.loginAsClient(clientPage);
  await clientPage.goto(`/creatives/${frank.creativeId}`);
  await clientPage.getByRole("button", { name: "Brief" }).first().click();
  await expect(clientPage.locator(".bsec", { hasText: "Concept" })).toBeVisible();
  await expect(clientPage.locator(".bsec", { hasText: "Notes for Designer" })).toHaveCount(0);
  await ctx.close();
  const client = await signedIn(frank.clientEmail, frank.clientPassword);
  expect((await client.from("reference_images").select("id")).data).toEqual([]);
  expect((await client.from("designer_notes").select("creative_id")).data).toEqual([]);
  expect((await client.from("design_directions").select("id")).data).toEqual([]);
});
