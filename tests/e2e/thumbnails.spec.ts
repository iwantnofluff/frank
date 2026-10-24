import { createClient } from "@supabase/supabase-js";
import { test, expect, goToMonth } from "./fixtures";

// A video post's Thumbnail (phase118, direct instruction): on the Content
// tab after Creative, saved as versions, with Thumbnail Text on Image; in
// the table's Creative column, a small phone with the thumbnail, the
// hover showing it in place of the video; the client sees it too.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
// A 4x4 red PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEklEQVR4nGP4z8CAB+GTG8HSALfKY52fTcuYAAAAAElFTkSuQmCC",
  "base64",
);

test("a Reel's thumbnail saves as versions with its words, shows in the table and to the client", async ({ page, browser, frank }) => {
  test.setTimeout(150_000);
  await admin.from("creatives").update({ format: "ig_reel", formats: ["ig_reel"] }).eq("id", frank.creativeId);
  await frank.createArtworkVersion(frank.creativeId, 1, "reel-cut.png");
  const stageBefore = (await admin.from("creatives").select("stage").eq("id", frank.creativeId).single()).data!.stage;
  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("tab", { name: "Content" }).click();

  await expect(page.locator(".msection-h", { hasText: /^Thumbnail$/ })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("Thumbnail file").setInputFiles({ name: "cover-a.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Save Thumbnail V1" }).click();
  await expect(page.getByText("Saved as version 1.")).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Thumbnail file").setInputFiles({ name: "cover-b.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Save Thumbnail V2" }).click();
  await expect(page.getByText("Saved as version 2.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("tab", { name: "Thumbnail V1" })).toBeVisible();

  // Its words are on Production (direct instruction).
  await page.getByRole("tab", { name: "Production" }).click();
  await page.getByLabel("Thumbnail Text on Image").fill("WATCH TILL THE END");
  await page.getByRole("button", { name: "Save Thumbnail Text on Image" }).click();
  await expect(page.locator(".bsaved", { hasText: "Saved." }).last()).toBeVisible({ timeout: 15_000 });

  const rows = (await admin.from("thumbnail_versions").select("version_no, asset:assets(filename)").eq("creative_id", frank.creativeId).order("version_no")).data;
  expect(rows).toEqual([
    { version_no: 1, asset: { filename: "cover-a.png" } },
    { version_no: 2, asset: { filename: "cover-b.png" } },
  ]);
  const post = (await admin.from("creatives").select("stage, thumbnail_text").eq("id", frank.creativeId).single()).data!;
  expect(post.thumbnail_text).toBe("WATCH TILL THE END");
  // Saving a thumbnail doesn't move the post on.
  expect(post.stage).toBe(stageBefore);
  await page.keyboard.press("Escape");

  // The table: the small phone with the thumbnail and the file name; the
  // hover shows the thumbnail.
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty", { timeout: 60_000 });
  await goToMonth(page, "March 2027");
  const cell = page.locator("tr[data-row]", { hasText: "E2E Test Creative" }).locator(".artcell");
  await expect(cell.locator(".artmini img")).toBeVisible({ timeout: 15_000 });
  await expect(cell).toContainText("reel-cut.png");
  await cell.hover();
  await expect(page.locator(".phonepop .pp-media img")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".phonepop .pp-media video")).toHaveCount(0);

  // The client, on the post's page, sees it with its words.
  const ctx = await browser.newContext();
  const clientPage = await ctx.newPage();
  await admin.from("creatives").update({ stage: 4 }).eq("id", frank.creativeId);
  await frank.loginAsClient(clientPage);
  await clientPage.goto(`/creatives/${frank.creativeId}`);
  await expect(clientPage.locator(".pthumb")).toContainText("Thumbnail", { timeout: 15_000 });
  await expect(clientPage.locator(".pthumb")).toContainText("WATCH TILL THE END");
  await expect(clientPage.locator(".pthumb img")).toBeVisible();
  await ctx.close();
});

test("a Reel with no thumbnail has Add Thumbnail in the table, for the team, opening the Thumbnail slot", async ({ page, browser, frank }) => {
  test.setTimeout(120_000);
  await admin.from("creatives").update({ format: "ig_reel", formats: ["ig_reel"], stage: 4 }).eq("id", frank.creativeId);
  await frank.createArtworkVersion(frank.creativeId, 1, "reel-cut.png");
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty", { timeout: 60_000 });
  await goToMonth(page, "March 2027");
  const row = page.locator("tr[data-row]", { hasText: "E2E Test Creative" });
  await row.getByRole("button", { name: "Add Thumbnail" }).click();
  await expect(page.getByRole("button", { name: "Add the thumbnail" })).toBeFocused({ timeout: 15_000 });

  // Saved, the button goes.
  await page.getByLabel("Thumbnail file").setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Save Thumbnail V1" }).click();
  await expect(page.getByText("Saved as version 1.")).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Escape");
  await expect(row.getByRole("button", { name: "Add Thumbnail" })).toHaveCount(0, { timeout: 15_000 });

  // A client never sees it.
  await admin.from("thumbnail_versions").delete().eq("creative_id", frank.creativeId);
  const ctx = await browser.newContext();
  const cp = await ctx.newPage();
  await frank.loginAsClient(cp);
  await cp.goto(`/projects/${frank.projectId}`);
  await cp.waitForSelector(".tblwrap, .empty", { timeout: 60_000 });
  await goToMonth(cp, "March 2027");
  const clientRow = cp.locator("tr[data-row]", { hasText: "E2E Test Creative" });
  await expect(clientRow.locator("td.artcell-td")).toBeVisible();
  await expect(cp.getByText("Add Thumbnail")).toHaveCount(0);
  await expect(clientRow.locator("td.artcell-td")).not.toContainText("Pending");
  await ctx.close();
});
