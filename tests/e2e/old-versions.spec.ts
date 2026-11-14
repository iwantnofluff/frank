import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Earlier versions on a post's page (direct instruction): a comment made on
// one says which, after its Public or Private pill; picking it brings that
// version up, its picker lit for a moment; and while an earlier artwork or
// copy version shows, Old Version reads in red after the format, the
// picker red too.
test("a comment on an earlier version says which, and picking it shows that version as Old Version", async ({ page, frank }) => {
  test.setTimeout(120_000);
  await frank.createArtworkVersion(frank.creativeId, 1, "first.png");
  await frank.createArtworkVersion(frank.creativeId, 2, "second.png");
  await frank.createCopyVersion(frank.creativeId, 1, { caption: "First caption" });
  await frank.createCopyVersion(frank.creativeId, 2, { caption: "Second caption" });
  const versions = async (table: "creative_versions" | "copy_versions") =>
    Object.fromEntries(
      ((await admin.from(table).select("id, version_no").eq("creative_id", frank.creativeId)).data ?? []).map((v) => [v.version_no, v.id]),
    );
  const art = await versions("creative_versions");
  const copy = await versions("copy_versions");
  const oldId = await frank.insertCommentAsStaff("Was the logo bigger here?", "public");
  await admin.from("comments").update({ creative_version_id: art[1], copy_version_id: copy[1] }).eq("id", oldId);
  const newId = await frank.insertCommentAsStaff("Newest looks right", "public");
  await admin.from("comments").update({ creative_version_id: art[2], copy_version_id: copy[2] }).eq("id", newId);
  // Words picked out of the caption: the copy's version, here the earlier.
  const capId = await frank.insertCommentAsStaff("Shorter please", "public");
  await admin
    .from("comments")
    .update({
      creative_version_id: art[2],
      copy_version_id: copy[1],
      anchor: { type: "highlight", field: "caption", start: 0, end: 5, quote: "First" },
    })
    .eq("id", capId);

  await frank.loginAsStaff(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const oldCard = page.locator(".cmt", { hasText: "Was the logo bigger here?" });
  // Every comment's version after its pill (direct instruction): the
  // artwork's here, red when earlier, grey on the newest.
  await expect(oldCard.locator(".cmt-f .vtag-old")).toHaveText("V1", { timeout: 20_000 });
  const newCard = page.locator(".cmt", { hasText: "Newest looks right" });
  await expect(newCard.locator(".cmt-f .vtag")).toHaveText("V2");
  await expect(newCard.locator(".vtag-old")).toHaveCount(0);
  await expect(page.locator(".cmt", { hasText: "Shorter please" }).locator(".cmt-f .vtag-old")).toHaveText("V1");
  // The newest showing: no Old Version.
  await expect(page.locator(".pnav-old")).toHaveCount(0);
  await expect(page.locator("#vCreative")).toHaveValue(art[2]);
  await expect(page.locator("#vCreative")).not.toHaveClass(/vold/);

  // Picking the older comment: its versions show, their pickers lit.
  await oldCard.locator(".cbody").click();
  await expect(page.locator("#vCreative")).toHaveValue(art[1]);
  await expect(page.locator("#vCopy")).toHaveValue(copy[1]);
  await expect(page.locator(".vsel.vflash")).toHaveCount(2);
  await expect(page.locator(".pnav-old")).toHaveText("Old Version");
  await expect(page.locator(".pnav-fmtline .pnav-sep")).toHaveCount(1);
  await expect(page.locator("#vCreative")).toHaveClass(/vold/);
  await expect(page.locator("#vCreative option.vold")).toHaveText(["V1"]);
  // The light goes after a moment.
  await expect(page.locator(".vsel.vflash")).toHaveCount(0, { timeout: 5_000 });

  // Back to the newest: Old Version goes.
  await page.locator("#vCreative").selectOption(art[2]);
  await page.locator("#vCopy").selectOption(copy[2]);
  await expect(page.locator(".pnav-old")).toHaveCount(0);
  // Only the copy older: still Old Version.
  await page.locator("#vCopy").selectOption(copy[1]);
  await expect(page.locator(".pnav-old")).toHaveText("Old Version");
  await expect(page.locator("#vCopy")).toHaveClass(/vold/);
  await expect(page.locator("#vCreative")).not.toHaveClass(/vold/);
});
