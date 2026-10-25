import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";

// The workspace's proofreading rules (phase122, direct instruction):
// Settings → Knowledge → Proofreading, above Format Directions. Owners and
// Admins switch rules and add their own; a User reads them. Live AI is
// never asserted: the route is checked with every AI rule off, so what it
// finds is worked out exactly.
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const AI_RULES = ["spelling", "grammar", "punctuation", "convention", "names", "hashtags", "no_em_dash", "no_colons", "ai_phrases"];

test("an Admin switches rules and adds their own; a User only reads them", async ({ page, frank }) => {
  test.setTimeout(120_000);
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  const setRole = (role: string) => admin.from("memberships").update({ role }).eq("user_id", staffId).eq("agency_id", frank.agencyId).select("id").single();
  await setRole("admin");

  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/settings/knowledge/proofreading`);
  // In the menu, above Format Directions.
  const menu = page.locator("a", { hasText: /^(Proofreading|Format Directions)$/ });
  await expect(menu).toHaveText(["Proofreading", "Format Directions"]);
  await expect(page.locator(".panel-h .sync").first()).toHaveText("13 of 13 on");

  // A built-in, off and saved.
  const colons = page.getByRole("switch", { name: "No colons" });
  await expect(colons).toHaveAttribute("aria-checked", "true");
  await colons.click();
  await expect(colons).toHaveAttribute("aria-checked", "false");
  await expect
    .poll(async () => (await admin.from("proofread_rules").select("enabled").eq("agency_id", frank.agencyId).eq("rule_key", "no_colons").maybeSingle()).data?.enabled)
    .toBe(false);
  await page.getByLabel("Spelling convention").selectOption("british");
  await expect
    .poll(async () => (await admin.from("proofread_rules").select("options").eq("agency_id", frank.agencyId).eq("rule_key", "convention").maybeSingle()).data?.options)
    .toEqual({ convention: "british" });
  await page.reload();
  await expect(page.getByRole("switch", { name: "No colons" })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByLabel("Spelling convention")).toHaveValue("british");
  await expect(page.locator(".panel-h .sync").first()).toHaveText("12 of 13 on");

  // The workspace's own rule, and a preferred word.
  await page.getByRole("button", { name: "Add Rule" }).click();
  await page.getByLabel("The rule").fill("Never use & in a sentence.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".pr-own", { hasText: "Never use & in a sentence." })).toBeVisible();
  await page.getByRole("button", { name: "Add Word" }).click();
  await page.getByLabel("Instead of").fill("e-commerce");
  await page.getByLabel("Write", { exact: true }).fill("ecommerce");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".pr-own", { hasText: "e-commerce" })).toBeVisible();
  const own = (await admin.from("proofread_rules").select("kind, body, from_word, to_word").eq("agency_id", frank.agencyId).neq("kind", "builtin").order("kind")).data;
  expect(own).toEqual([
    { kind: "instruction", body: "Never use & in a sentence.", from_word: null, to_word: null },
    { kind: "word", body: null, from_word: "e-commerce", to_word: "ecommerce" },
  ]);

  // As a User: read only, on the page and in the database.
  const { data: m } = await setRole("user");
  await admin.from("staff_client_access").insert({ membership_id: m!.id, client_id: frank.clientId });
  await page.reload();
  await expect(page.getByText("Only Owners and Admins can change them.")).toBeVisible();
  await expect(page.getByRole("switch", { name: "No colons" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Add Rule" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(0);
  const u = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  await u.auth.signInWithPassword({ email: frank.staffEmail, password: frank.staffPassword });
  const tried = await u.from("proofread_rules").update({ enabled: true }).eq("agency_id", frank.agencyId).select("id");
  expect(tried.data ?? []).toHaveLength(0);
  expect((await u.from("proofread_rules").select("id").eq("agency_id", frank.agencyId)).data).toHaveLength(4);
});

test("with every AI rule off, a proofread follows the workspace's rules without an AI request", async ({ page, frank }) => {
  test.setTimeout(120_000);
  const { error: seedError } = await admin.from("proofread_rules").insert(
    [
      ...AI_RULES.map((k) => ({ agency_id: frank.agencyId, kind: "builtin", rule_key: k, enabled: false })),
      { agency_id: frank.agencyId, kind: "builtin", rule_key: "repeats", enabled: false },
      { agency_id: frank.agencyId, kind: "word", from_word: "e-commerce", to_word: "ecommerce" },
      // Switched off, so it's not used.
      { agency_id: frank.agencyId, kind: "word", from_word: "love", to_word: "adore", enabled: false },
    ],
    // Rows leave out different columns; those take their defaults, not null.
    { defaultToNull: false },
  );
  if (seedError) throw seedError;
  const caption = "We love e-commerce  , truly the the best.\nShop now. #shop-local";
  await frank.createCopyVersion(frank.creativeId, 1, { caption });
  const { data: v } = await admin.from("copy_versions").select("id").eq("creative_id", frank.creativeId).single();
  const used = async () => (await admin.from("ai_usage_events").select("id", { count: "exact", head: true }).eq("agency_id", frank.agencyId)).count ?? 0;
  const before = await used();

  await frank.loginAsStaff(page);
  const res = await page.request.post(`${APP_URL}/api/ai/proofread`, { data: { kind: "copy", versionId: v!.id } });
  expect(res.status()).toBe(200);
  const { suggestions } = (await res.json()) as { suggestions: { kind: string; from: string; to: string }[] };
  // Paragraphs, spaces and the preferred word; repeats are off, and so is
  // every AI rule, hashtags included.
  expect(suggestions.map((s) => s.kind).sort()).toEqual(["paragraph", "spacing", "word"]);
  expect(suggestions.find((s) => s.kind === "word")).toMatchObject({ from: "e-commerce", to: "ecommerce" });
  expect(await used()).toBe(before);
  // Kept with the version, as the post page reads it.
  expect((await admin.from("proofreads").select("suggestions").eq("version_id", v!.id).single()).data!.suggestions).toHaveLength(3);
});
