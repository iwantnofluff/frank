import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL, type Frank } from "./fixtures";

// Text on Image and VO versions on the post page (phase161, direct
// instruction): beside Creative and Copy, the team's only, while the
// placeholder shows their words (the VO's on a video post). Comments record
// the ones showing, say their V, and bring them back up when picked.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function seed(frank: Frank) {
  const { error } = await admin
    .from("creatives")
    .update({
      format: "ig_reel",
      formats: ["ig_reel"],
      slide_count: null,
      slide_text: ["Save 20% now"],
      voiceover: "Twenty percent off, this week only.",
      scheduled_at: new Date().toISOString(),
    })
    .eq("id", frank.creativeId);
  if (error) throw new Error(error.message);
  // Saving the post's words makes their V1; replaced by these.
  await admin.from("production_versions").delete().eq("creative_id", frank.creativeId);
  const rows = [
    { field: "slide_text", version_no: 1, slides: ["Save 10% today"], body: null },
    { field: "slide_text", version_no: 2, slides: ["Save 20% now"], body: null },
    { field: "voiceover", version_no: 1, slides: [], body: "Ten percent off, today only." },
    { field: "voiceover", version_no: 2, slides: [], body: "Twenty percent off, this week only." },
  ].map((r) => ({ ...r, creative_id: frank.creativeId }));
  const { data, error: insertError } = await admin.from("production_versions").insert(rows).select("id, field, version_no");
  if (insertError) throw new Error(insertError.message);
  const id = (field: string, no: number) => data!.find((v) => v.field === field && v.version_no === no)!.id as string;
  return { toi1: id("slide_text", 1), toi2: id("slide_text", 2), vo1: id("voiceover", 1), vo2: id("voiceover", 2) };
}

test("the team picks Text on Image and VO versions on the placeholder, and comments record them", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const v = await seed(frank);
  // A comment on the earlier Text on Image's words.
  const oldId = await frank.insertCommentAsStaff("Was 10% right?", "private");
  await admin
    .from("comments")
    .update({ anchor: { type: "highlight", field: "slide_text", start: 5, end: 8, quote: "10%" }, slide_text_version_id: v.toi1 })
    .eq("id", oldId);

  await frank.loginAsStaff(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const toi = page.locator("#vToi");
  const vo = page.locator("#vVo");
  // After Copy, the latest of each, the latest words showing.
  await expect(toi).toHaveValue(v.toi2);
  await expect(vo).toHaveValue(v.vo2);
  const labels = await page.locator(".vselbar .vsel label").allTextContents();
  expect(labels.indexOf("Text on Image")).toBe(labels.indexOf("Copy") + 1);
  expect(labels.indexOf("VO")).toBe(labels.indexOf("Text on Image") + 1);
  await expect(page.locator(".noart-toi").first()).toContainText("Save 20% now");
  await expect(page.locator(".pnav-old")).toHaveCount(0);

  // The comment says its Text on Image version, red; picking it brings V1
  // up, its picker lit, the earlier words shown and marked.
  const oldCard = page.locator(".cmt", { hasText: "Was 10% right?" });
  await expect(oldCard.locator(".cmt-f .vtag-old")).toHaveText("TOI V1");
  await expect(oldCard.locator(".cmt-f .vtag")).toHaveAttribute("title", /Text on Image V1/);
  await oldCard.locator(".cbody").click();
  await expect(toi).toHaveValue(v.toi1);
  await expect(page.locator(".vsel.vflash")).toHaveCount(1);
  await expect(toi).toHaveClass(/vold/);
  await expect(page.locator(".pnav-old")).toHaveText("Old Version");
  await expect(page.locator(".noart-toi").first()).toContainText("Save 10% today");
  await expect(page.locator(".noart-toi").first().locator("mark", { hasText: "10%" })).toHaveCount(1);

  // The earlier VO too.
  await vo.selectOption(v.vo1);
  await expect(page.locator(".noart-vo")).toContainText("Ten percent off, today only.");

  // A plain comment now records the versions showing.
  await page.getByPlaceholder("Add a comment…").fill("Plain on the earlier words");
  await page.locator(".composer").getByRole("button", { name: "Post" }).click();
  await expect(page.locator(".cmt", { hasText: "Plain on the earlier words" })).toBeVisible();
  await expect
    .poll(async () => (await admin.from("comments").select("slide_text_version_id, voiceover_version_id").eq("creative_id", frank.creativeId).eq("body", "Plain on the earlier words").maybeSingle()).data)
    .toEqual({ slide_text_version_id: v.toi1, voiceover_version_id: v.vo1 });
});

test("a client has no Text on Image or VO pickers, and nor does a post with artwork", async ({ page, browser, frank }) => {
  test.setTimeout(90_000);
  await seed(frank);
  const ctx = await browser.newContext();
  const cp = await ctx.newPage();
  await frank.loginAsClient(cp);
  await cp.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await expect(cp.locator(".noart-toi").first()).toContainText("Save 20% now");
  await expect(cp.locator("#vToi")).toHaveCount(0);
  await expect(cp.locator("#vVo")).toHaveCount(0);
  await ctx.close();

  await frank.createArtworkVersion(frank.creativeId, 1, "art.png");
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await expect(page.locator("#vCreative")).toBeEnabled();
  await expect(page.locator("#vToi")).toHaveCount(0);
  await expect(page.locator("#vVo")).toHaveCount(0);
});
