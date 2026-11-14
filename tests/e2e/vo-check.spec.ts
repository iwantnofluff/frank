import { createClient } from "@supabase/supabase-js";
import { test, expect, APP_URL } from "./fixtures";

// Check VO and Text on Image (direct instruction): on a video post's Checks
// tab, under Check WIIFM, a button opening the two side by side with
// Frank's note on any mismatch in wording or meaning. The AI's answer is
// stubbed here; real answers are checked by hand.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

test("a video post's VO and Text on Image are checked side by side, unsaved words included", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const { error } = await admin
    .from("creatives")
    .update({ format: "ig_reel", formats: ["ig_reel"], slide_count: null, scheduled_at: new Date().toISOString() })
    .eq("id", frank.creativeId);
  if (error) throw new Error(error.message);

  const sent: { creativeId: string; vo: string; texts: string[] }[] = [];
  await page.route("**/api/ai/check-vo", async (route) => {
    sent.push(route.request().postDataJSON());
    // Long enough to see Frank's wait.
    await new Promise((r) => setTimeout(r, 800));
    await route.fulfill({
      json: {
        same: false,
        summary: "The VO offers 30% off; the screen says 20%.",
        mismatches: [
          { kind: "wording", title: "The discount", body: "VO: \"30% off\". Text on Image: \"20% off\". Use one figure." },
          { kind: "meaning", title: "Who it's for", body: "The VO speaks to new customers; the screen to everyone." },
        ],
      },
    });
  });

  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: /^Upload (Video|Creative|Creatives)$/ }).click();
  const modal = page.locator(".scrim .modal").first();

  // Greyed until both are written.
  await modal.getByRole("tab", { name: "Checks" }).click();
  const heads = await modal.locator(".msection-h").allTextContents();
  expect(heads.indexOf("Check VO and Text on Image")).toBe(heads.indexOf("Check WIIFM") + 1);
  const button = modal.getByRole("button", { name: "Check VO and Text on Image" });
  await expect(button).toBeDisabled();
  await expect(modal.getByText("Write the VO and the Text on Image on the Production tab first")).toBeVisible();

  // Written, not saved.
  await modal.getByRole("tab", { name: "Production" }).click();
  await modal.getByLabel("VO", { exact: true }).fill("New customers get 30% off this week.");
  await modal.locator("[data-focus=\"imageOnText\"] textarea").first().fill("20% off this week");
  await modal.getByRole("tab", { name: "Checks" }).click();
  await button.click();

  const win = page.getByRole("dialog", { name: "Check VO and Text on Image" });
  // As proofreading's wait (direct instruction).
  await expect(win.getByRole("status")).toContainText("Frank is checking");
  await expect(win.getByRole("region", { name: "VO" })).toContainText("New customers get 30% off this week.");
  await expect(win.getByRole("region", { name: "Text on Image" })).toContainText("20% off this week");
  const verdict = win.getByRole("region", { name: "Frank's check" });
  await expect(verdict.locator(".checkfind").first()).toContainText("They differ");
  await expect(verdict.locator(".checkfind").first()).toContainText("The VO offers 30% off; the screen says 20%.");
  await expect(verdict.locator(".checkfind .tag")).toHaveText(["Wording", "Meaning"]);
  expect(sent).toEqual([{ creativeId: frank.creativeId, vo: "New customers get 30% off this week.", texts: ["20% off this week"], noun: "Slide" }]);

  // Again on request, with Frank's wait again.
  await win.getByRole("button", { name: "Check Again" }).click();
  await expect(win.getByRole("status")).toContainText("Frank is checking");
  await expect.poll(() => sent.length).toBe(2);
  await expect(verdict.locator(".checkfind").first()).toContainText("They differ");

  // Add To Comments (direct instruction): a box filled with the result, to
  // edit, then post; here made public.
  await win.getByRole("button", { name: "Add To Comments" }).click();
  const draft = win.getByRole("textbox", { name: "Comment to add" });
  await expect(draft).toHaveValue(
    'Check VO and Text on Image: The VO offers 30% off; the screen says 20%.\n\nWording, The discount: VO: "30% off". Text on Image: "20% off". Use one figure.\n\nMeaning, Who it\'s for: The VO speaks to new customers; the screen to everyone.',
  );
  await draft.pressSequentially("\nOne\nTwo\nThree\nFour");
  await win.locator(".intog").click();
  await win.getByRole("button", { name: "Post" }).click();
  await expect(win.getByText("Added to the comments.")).toBeVisible();
  await expect(draft).toHaveCount(0);
  const { data: rows } = await admin.from("comments").select("body, visibility").eq("creative_id", frank.creativeId);
  expect(rows).toHaveLength(1);
  expect(rows![0].visibility).toBe("public");
  expect(rows![0].body).toMatch(/^Check VO and Text on Image: .*\nFour$/s);

  // Done closes it, leaving the post's window open.
  await win.getByRole("button", { name: "Done" }).click();
  await expect(win).toHaveCount(0);
  await expect(modal.getByRole("tab", { name: "Checks" })).toBeVisible();

  // On the post, cut short with Read More, and Read Less once open (direct
  // instruction).
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  const card = page.locator(".cmt", { hasText: "The VO offers 30% off" });
  await expect(card.getByRole("button", { name: "Read More" })).toBeVisible();
  const cut = await card.locator(".cbody").evaluate((el) => el.clientHeight);
  await card.getByRole("button", { name: "Read More" }).click();
  await expect(card.getByRole("button", { name: "Read Less" })).toBeVisible();
  expect(await card.locator(".cbody").evaluate((el) => el.clientHeight)).toBeGreaterThan(cut);
  await card.getByRole("button", { name: "Read Less" }).click();
  await expect(card.getByRole("button", { name: "Read More" })).toBeVisible();
  // A short comment has no Read More.
  await page.getByPlaceholder("Add a comment…").fill("Short one.");
  await page.locator(".composer").getByRole("button", { name: "Post" }).click();
  await expect(page.locator(".cmt", { hasText: "Short one." })).toBeVisible();
  await expect(page.locator(".cmt", { hasText: "Short one." }).getByRole("button", { name: "Read More" })).toHaveCount(0);
});

test("a post with no video format has no Check VO and Text on Image", async ({ page, frank }) => {
  await admin.from("creatives").update({ scheduled_at: new Date().toISOString() }).eq("id", frank.creativeId);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await page.getByRole("button", { name: /^Upload (Video|Creative|Creatives)$/ }).click();
  const modal = page.locator(".scrim .modal").first();
  await modal.getByRole("tab", { name: "Checks" }).click();
  await expect(modal.locator(".msection-h", { hasText: /^Check WIIFM$/ })).toBeVisible();
  await expect(modal.locator(".msection-h", { hasText: /^Check VO and Text on Image$/ })).toHaveCount(0);
});
