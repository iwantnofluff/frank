import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL, goToMonth } from "./fixtures";

// The hover card on a post's references (direct instruction). Real sites
// aren't fetched here (they'd make the suite depend on the internet): this
// covers who may ask, what's never fetched, and the card's fallback.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

test("link previews are for signed-in people, and never reach private addresses", async ({ page, frank }) => {
  const signedOut = await page.request.get(`${APP_URL}/api/link-preview?url=https://example.com`, { maxRedirects: 0 });
  expect(signedOut.status()).not.toBe(200);

  await frank.loginAsStaff(page);
  for (const url of ["http://127.0.0.1:3000/", "http://169.254.169.254/latest/meta-data/", "http://localhost/", "file:///etc/passwd"]) {
    const r = await page.evaluate(async (u) => (await fetch(`/api/link-preview?url=${encodeURIComponent(u)}`)).json(), url);
    expect(r, url).toEqual({ preview: null });
  }
});

test("hovering a reference shows its card, falling back to the full address", async ({ page, frank }) => {
  const ref = "http://127.0.0.1/a-reference-with-no-preview";
  await admin.from("creatives").update({ reference_urls: [ref] }).eq("id", frank.creativeId);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  await page.waitForSelector("td.skchk");
  await page.getByRole("link", { name: ref }).hover();
  const card = page.locator(".linkcard");
  await expect(card).toContainText("No preview from this site");
  await expect(card.locator(".linkcard-url")).toHaveText(ref);
  // It stays open with the pointer on it, and opens the page in a new tab.
  await card.hover();
  await page.waitForTimeout(400);
  await expect(card).toHaveAttribute("href", ref);
  await expect(card).toHaveAttribute("target", "_blank");
});
