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
  test.setTimeout(60_000);
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

  // Design with Frank waits for a saved Concept (direct instruction).
  const designWithFrank = page.getByRole("button", { name: "Design with Frank" });
  await expect(designWithFrank).toBeDisabled();
  await page.locator("#nbConcept").fill("Warm and slow.");
  await page.getByRole("button", { name: "Save Concept and References" }).click();
  await expect(page.locator(".bsaved", { hasText: "Saved." })).toBeVisible({ timeout: 15_000 });
  await expect(designWithFrank).toBeEnabled();
  // Then, from the footer: the seeded direction's Use This fills Notes for
  // Designer with it and its guardrails, shown with headings; saved as V1.
  await designWithFrank.click();
  // Two ways in, as Draft with Frank's: Rework My Notes needs notes.
  await expect(page.getByRole("button", { name: "Direction from the Concept" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Rework My Notes" })).toBeDisabled();
  await page.getByRole("button", { name: "Use This: Steam" }).click();
  await expect(page.getByRole("button", { name: "Added: Steam" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).last().click();
  const view = page.locator(".notesview");
  await expect(view.locator(".nt-h")).toHaveText(["Steam", "Layout", "Palette", "Guardrails"]);
  await expect(view.locator(".nt-li")).toHaveText(["4:5", "A big logo"]);
  // Clicked, it's the text as written.
  await view.click();
  await expect(page.locator("textarea#nbNotes")).toHaveValue(/^Steam: Steam rising off the cup[\s\S]*Guardrails:\n- 4:5\n- A big logo$/);
  await page.getByRole("button", { name: "Save Notes V1" }).click();
  await expect(page.getByText("Saved as V1.")).toBeVisible({ timeout: 15_000 });
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
  expect((await client.from("designer_note_versions").select("id")).data).toEqual([]);
  expect((await client.from("design_directions").select("id")).data).toEqual([]);
});

test("Save Concept and References: on a new post it locks the Concept in for Design with Frank; on a saved one it saves those two only", async ({ page, frank }) => {
  test.setTimeout(60_000);
  await frank.loginAsStaff(page);

  // A saved post: only the Concept is saved, and Update after it isn't
  // taken for someone else's change.
  await page.goto(`/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("tab", { name: "Brief" }).click();
  await page.locator("#nbConcept").fill("Saved on its own");
  await page.locator("#nbNotes").fill("Pumpkin top left");
  await page.locator("#nbRef").fill("https://example.com/look");
  await page.locator("#nbName").fill("Renamed Later");
  await page.getByRole("button", { name: "Save Concept and References" }).click();
  await expect(page.locator(".bsaved", { hasText: "Saved." })).toBeVisible({ timeout: 15_000 });
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const after = (await admin.from("creatives").select("name, concept, reference_urls").eq("id", frank.creativeId).single()).data;
  expect(after).toEqual({ name: "E2E Test Creative", concept: "Saved on its own", reference_urls: ["https://example.com/look"] });
  // Notes save on their own (phase117): not yet.
  expect((await admin.from("designer_note_versions").select("id").eq("creative_id", frank.creativeId)).data).toEqual([]);
  // With notes in the window, Rework My Notes is there to ask for.
  await page.getByRole("button", { name: "Design with Frank" }).click();
  await expect(page.getByRole("button", { name: "Rework My Notes" })).toBeEnabled();
  await page.getByRole("button", { name: "Close" }).last().click();
  // Update asks for the notes to be saved first; then saves the rest.
  await page.getByRole("button", { name: "Update" }).click();
  await expect(page.getByText("Save the Notes for Designer first")).toBeVisible();
  await page.getByRole("button", { name: "Save Notes V1" }).click();
  await expect(page.getByText("Saved as V1.")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Update" }).click();
  await expect(page.getByText("Post updated.")).toBeVisible({ timeout: 15_000 });
  expect((await admin.from("creatives").select("name").eq("id", frank.creativeId).single()).data?.name).toBe("Renamed Later");
  expect((await admin.from("designer_note_versions").select("version_no, overall").eq("creative_id", frank.creativeId)).data).toEqual([
    { version_no: 1, overall: "Pumpkin top left" },
  ]);
  await page.keyboard.press("Escape");

  // A new post: Save Concept saves nothing yet, but Design with Frank
  // opens; changing the Concept closes it again until it's saved.
  await page.goto(`/projects/${frank.projectId}`);
  await page.getByRole("button", { name: "New Post", exact: true }).click();
  const designWithFrank = page.getByRole("button", { name: "Design with Frank" });
  await expect(page.getByRole("button", { name: "Save Concept and References" })).toBeDisabled();
  await page.locator("#nbConcept").fill("A new idea");
  await expect(designWithFrank).toBeDisabled();
  await page.getByRole("button", { name: "Save Concept and References" }).click();
  await expect(page.getByText("Saved. Create Post adds them to the post.")).toBeVisible();
  await expect(designWithFrank).toBeEnabled();
  expect((await admin.from("creatives").select("id").eq("concept", "A new idea")).data).toEqual([]);
  await page.locator("#nbConcept").fill("A newer idea");
  await expect(designWithFrank).toBeDisabled();
});

test("Design with Frank is a conversation: a follow-up carries the direction and comes back under it", async ({ page, frank }) => {
  test.setTimeout(60_000);
  const staff = await signedIn(frank.staffEmail, frank.staffPassword);
  const { data: me } = await staff.auth.getUser();
  const steam = { title: "Steam", idea: "Steam rising off the cup", layout: "Cup centred", style: "", palette: "Browns", textOnImage: "", slides: [], reel: null };
  const guardrails = { format: [], client: [], avoid: [] };
  const thread = "e2e-thread-0001";
  await staff.from("creatives").update({ concept: "Warm and slow." }).eq("id", frank.creativeId);
  const { error } = await staff.from("design_directions").insert({
    creative_id: frank.creativeId,
    created_by: me.user!.id,
    body: { mode: "concept", thread, at: "2026-10-20T10:00:00.000Z", summary: "Make it warm.", references: [], worked: [], directions: [steam], guardrails },
  });
  expect(error).toBeNull();

  // No live AI: the follow-up is answered here, as the route would answer
  // it, after checking what the window sent.
  let sent: Record<string, unknown> = {};
  await page.route("**/api/ai/design-direction", async (route) => {
    sent = JSON.parse(route.request().postData() ?? "{}");
    const body = { mode: "followup", thread, ask: sent.ask, at: "2026-10-20T10:05:00.000Z", summary: "Made the steam bigger.", references: [], worked: [], directions: [{ ...steam, title: "Steam, bolder", idea: "Big steam" }], guardrails };
    const { data: row } = await staff.from("design_directions").insert({ creative_id: frank.creativeId, created_by: me.user!.id, body }).select("id").single();
    await route.fulfill({
      contentType: "application/x-ndjson",
      body: [{ type: "refs", refs: [] }, { type: "text", text: JSON.stringify(body) }, { type: "done", id: row!.id, skippedFiles: [] }].map((e) => JSON.stringify(e)).join("\n") + "\n",
    });
  });

  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("tab", { name: "Brief" }).click();
  await page.getByRole("button", { name: "Design with Frank" }).click();
  await page.getByLabel("Message to Frank").fill("Bolder please");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.locator(".cchat-msg.user", { hasText: "Bolder please" })).toBeVisible();
  await expect(page.locator(".cchat-msg.assistant", { hasText: "Made the steam bigger." })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Use This: Steam, bolder" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use This: Steam", exact: true })).toBeVisible();
  await expect(page.locator(".cchat-past", { hasText: "1 reply" })).toBeVisible();
  expect(sent.mode).toBe("followup");
  expect(sent.thread).toBe(thread);
  expect(sent.ask).toBe("Bolder please");
  expect((sent.previous as { directions: { title: string }[] }).directions[0].title).toBe("Steam");
});
