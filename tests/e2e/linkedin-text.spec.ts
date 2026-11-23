import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL, goToMonth } from "./fixtures";

// LinkedIn Text Post (direct instruction): words only. No Creative to
// upload, no Text on Image, and on the phone just the post's text.
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// A row's cell under the column headed `label`, wherever that column is.
async function cellUnder(page: import("@playwright/test").Page, rowText: string, label: string) {
  if (!(await page.locator("th", { hasText: /^Notes for Designer/ }).count())) {
    await page.locator("tr[data-row] td input[type=checkbox]").first().waitFor({ timeout: 10_000 }).catch(() => {});
  }
  const index = await page.locator("thead tr").first().evaluate((tr, l) => {
    const name = (th: Element) => {
      const copy = th.cloneNode(true) as HTMLElement;
      copy.querySelectorAll("small").forEach((x) => x.remove());
      return (copy.textContent ?? "").trim();
    };
    return [...tr.querySelectorAll(":scope > th")].findIndex((th) => name(th) === l);
  }, label);
  expect(index, `a column headed ${label}`).toBeGreaterThan(-1);
  return page.locator("tr[data-row]", { hasText: rowText }).locator("td").nth(index);
}

test("a LinkedIn Text Post is made in the New Post window, asks for no artwork, and shows as its words", async ({ page, browser, frank }) => {
  test.setTimeout(120_000);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await page.getByRole("button", { name: "New Post", exact: true }).click();
  await page.fill("#nbName", "Words Only E2E");
  await page.fill("#nbDate", "2027-03-12");
  await page.click("#nbFmt");
  await page.getByRole("dialog", { name: "Formats" }).getByRole("checkbox", { name: "LinkedIn Text Post" }).click();
  await page.keyboard.press("Escape");
  await page.click('button:has-text("Create Post")');
  await expect(page.getByRole("tab", { name: "Content" })).toBeEnabled();
  const id = (await admin.from("creatives").select("id, formats").eq("project_id", frank.projectId).eq("name", "Words Only E2E").single()).data!;
  expect(id.formats).toEqual(["li_text"]);

  // Content: the Copy, no Creative. Production: no Text on Image.
  await page.getByRole("tab", { name: "Content" }).click();
  await expect(page.locator(".msection-h", { hasText: /^Copy$/ })).toBeVisible();
  await expect(page.locator(".msection-h", { hasText: /^Creative$/ })).toHaveCount(0);
  await page.getByRole("tab", { name: "Production" }).click();
  await expect(page.locator(".msection-h", { hasText: /^Text on Image$/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".modal")).toHaveCount(0);

  // The table: a dash for the Creative and the Text on Image, not Add.
  await frank.createCopyVersion(id.id, 1, { caption: "Three things we learned shipping in public." });
  await page.reload();
  await goToMonth(page, "March 2027");
  await page.waitForSelector(".tbl");
  await expect(await cellUnder(page, "Words Only E2E", "Creative")).toHaveText("—");
  await expect(await cellUnder(page, "Words Only E2E", "Text on Image")).toHaveText("—");

  // The post page: LinkedIn's post, its words, and no media box.
  await page.goto(`${APP_URL}/creatives/${id.id}`);
  const post = page.locator('.ig.li[data-platform="linkedin"]');
  await expect(post.locator(".pp-text")).toContainText("Three things we learned shipping in public.", { timeout: 20_000 });
  await expect(post.locator(".ig-media")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Upload/ })).toHaveCount(0);

  // On a review link too.
  await admin.from("creatives").update({ stage: 4 }).eq("id", id.id);
  const token = await frank.createSharedLink();
  const guest = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await guest.goto(`${APP_URL}/review/${token}`);
  await guest.locator(".dk-item", { hasText: "Words Only E2E" }).click();
  const shared = guest.locator('.ig.li[data-platform="linkedin"]');
  await expect(shared.locator(".pp-text")).toContainText("Three things we learned shipping in public.", { timeout: 20_000 });
  await expect(shared.locator(".ig-media")).toHaveCount(0);
});
