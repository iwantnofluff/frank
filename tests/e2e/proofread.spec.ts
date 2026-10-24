import { createClient } from "@supabase/supabase-js";
import { test, expect } from "./fixtures";
import { paragraphSuggestions } from "../../lib/proofread";

// Proofreading what's saved (phase121, direct instruction): suggestions
// under the field with Fix and Ignore, kept with the version. Live AI is
// never asserted here: the proofread is seeded as the route would save it.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CAPTION = "Thsi is it, its fine.\nNobody misses on purpose.";

test("a copy version's suggestions: Fix puts it in the editor, Ignore keeps it hidden, Fix All does the rest", async ({ page, frank }) => {
  test.setTimeout(120_000);
  await frank.createCopyVersion(frank.creativeId, 1, { caption: CAPTION });
  const { data: v } = await admin.from("copy_versions").select("id").eq("creative_id", frank.creativeId).single();
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  const suggestions = [
    { id: "s1", field: "caption", from: "Thsi", to: "This", reason: "typo", kind: "spelling" },
    { id: "s2", field: "caption", from: "its fine", to: "it's fine", reason: "contraction", kind: "grammar" },
    { id: "s3", field: "caption", from: "is it", to: "is it really", reason: "unneeded", kind: "grammar" },
    ...paragraphSuggestions("caption", CAPTION),
  ];
  await admin.from("proofreads").insert({ creative_id: frank.creativeId, kind: "copy", version_id: v!.id, suggestions, created_by: staffId });

  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const modal = page.locator(".scrim .modal").first();
  await modal.getByRole("tab", { name: "Content" }).click();
  const proof = modal.locator(".proof");
  await expect(proof.locator("li")).toHaveCount(4, { timeout: 15_000 });
  const caption = modal.locator(".field", { has: page.locator("label", { hasText: /^Caption$/ }) }).locator("textarea");

  await proof.getByRole("button", { name: "Fix: Thsi to This" }).click();
  await expect(caption).toHaveValue("This is it, its fine.\nNobody misses on purpose.");
  await expect(proof.locator("li")).toHaveCount(3);

  await proof.getByRole("button", { name: "Ignore: is it" }).click();
  await expect(proof.locator("li")).toHaveCount(2);
  await expect.poll(async () => (await admin.from("proofreads").select("ignored").eq("version_id", v!.id).single()).data!.ignored).toEqual(["s3"]);

  await proof.getByRole("button", { name: "Fix All" }).click();
  await expect(caption).toHaveValue("This is it, it's fine.\n\nNobody misses on purpose.");
  await expect(proof).toHaveCount(0);
  // Nothing saved until the person saves.
  expect((await admin.from("copy_versions").select("fields").eq("id", v!.id).single()).data!.fields).toEqual({ caption: CAPTION });
});

test("a Production field's suggestions sit under it, and its Fix goes into that field", async ({ page, frank }) => {
  test.setTimeout(120_000);
  await admin.from("creatives").update({ format: "ig_reel", formats: ["ig_reel"], voiceover: "Pour it slow its the only way." }).eq("id", frank.creativeId);
  const { data: vo } = await admin.from("production_versions").select("id").eq("creative_id", frank.creativeId).eq("field", "voiceover").single();
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  await admin.from("proofreads").insert({
    creative_id: frank.creativeId,
    kind: "production",
    version_id: vo!.id,
    suggestions: [{ id: "v1", field: "voiceover", from: "slow its", to: "slow, it's", reason: "punctuation", kind: "punctuation" }],
    created_by: staffId,
  });
  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const modal = page.locator(".scrim .modal").first();
  await modal.getByRole("tab", { name: "Production" }).click();
  await modal.locator(".proof").getByRole("button", { name: /^Fix/ }).click();
  await expect(modal.getByLabel("VO", { exact: true })).toHaveValue("Pour it slow, it's the only way.");
  await expect(modal.getByRole("button", { name: "Save to V1" })).toBeEnabled();
});
