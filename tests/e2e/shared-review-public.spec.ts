import { createClient } from "@supabase/supabase-js";
import { test, expect } from "./fixtures";

// No session at all — a real share-link visitor. Exercises .phonewrap/
// .browser/.phone/.dk-*/.pw-side/.pw-seg (the public review page, entirely
// separate CSS from the authenticated app shell).
//
// Which shape shows is now a manual .pw-seg toggle, not a media query
// (docs/parity-gaps.md, ".phonewrap preview toggle — RESOLVED") — matches
// the prototype's own .desk class mechanism exactly. Default is "phone",
// same as the prototype's `let shareView="phone"`, regardless of the
// visitor's actual device; a real desktop visitor now has to click
// "Desktop" to see that layout, which is a deliberate, disclosed change
// from this page's previous responsive-by-default behaviour.

test("shared review — phone (default)", async ({ page, frank }) => {
  const token = await frank.createSharedLink();
  await page.goto(`/review/${token}`);
  // .phonewrap renders for the loading state too ("Loading…", nothing
  // else) — wait for real content, not just the wrapper.
  await page.waitForSelector(".m-top");
  await expect(page).toHaveScreenshot("shared-review-phone.png");
});

test("shared review — guest picks identity from the Client Team list", async ({ page, frank }) => {
  await frank.createClientContact("Jonathan Lead", "jonathan@example.com");
  await frank.createClientContact("Priya Client", "priya@example.com");
  const token = await frank.createSharedLink();
  await page.goto(`/review/${token}`);
  await page.waitForSelector(".m-top");

  const picker = page.locator("select").first();
  await expect(picker.locator("option")).toHaveText([
    "Who are you?",
    "Jonathan Lead",
    "Priya Client",
    "Someone else",
  ]);

  // Not on the list yet — the fallback stays available, never a closed set.
  await picker.selectOption({ label: "Someone else" });
  await expect(page.locator('input[placeholder="Your name"]')).toBeVisible();
  await expect(page.locator('input[placeholder="Your email"]')).toBeVisible();

  // Picking a real contact hides the free-text inputs and, once a comment
  // is posted under that name, the picker itself is replaced by the
  // "Commenting as X" pill — the same behavior already established for a
  // typed identity, now also covering a picked one.
  await picker.selectOption({ label: "Jonathan Lead" });
  await expect(page.locator('input[placeholder="Your name"]')).toHaveCount(0);
  await page.fill("textarea", "Looks good, approved from my side.");
  await page.click('button:has-text("Post")');
  await expect(page.locator("text=Commenting as").first()).toBeVisible();
  await expect(page.locator("b", { hasText: "Jonathan Lead" }).first()).toBeVisible();
});

test("shared review — a plain login link is present but never required", async ({ page, frank }) => {
  const token = await frank.createSharedLink();
  await page.goto(`/review/${token}`);
  await page.waitForSelector(".m-top");

  const loginLink = page.locator('a:has-text("Log in")').first();
  await expect(loginLink).toHaveAttribute("href", "/login");

  // Commenting without ever touching that link still works.
  await page.fill('input[placeholder="Your name"]', "Guest Reviewer");
  await page.fill('input[placeholder="Your email"]', "guest@example.com");
  await page.fill("textarea", "Anonymous feedback, no login used.");
  await page.click('button:has-text("Post")');
  await expect(page.locator("text=Commenting as").first()).toBeVisible();
});

test("shared review — posting a comment fires classification without waiting on it", async ({ page, frank }) => {
  // Comment intelligence, Phase 1 (docs/frank-data-intelligence.pdf) — every
  // comment gets classified after the fact. This only asserts the wiring
  // (the right request fires, Post doesn't block on it) — the actual AI
  // response isn't deterministic enough for a permanent, always-run test;
  // that's verified manually against the real dev server instead (see
  // docs/parity-gaps.md).
  const token = await frank.createSharedLink();
  await page.goto(`/review/${token}`);
  await page.waitForSelector(".m-top");

  const classifyRequest = page.waitForRequest(
    (req) => req.url().includes("/api/ai/classify-comment") && req.method() === "POST",
  );

  await page.locator('input[placeholder="Your name"]').first().fill("Guest Reviewer");
  await page.locator('input[placeholder="Your email"]').first().fill("guest@example.com");
  await page.locator("textarea").first().fill("This serum erases wrinkles overnight.");
  const postStart = Date.now();
  await page.locator('button:has-text("Post")').first().click();
  await expect(page.locator("text=Commenting as").first()).toBeVisible();
  // Posting itself never waits on the classify call — a few hundred ms at
  // most, nowhere near what an LLM round trip would add.
  expect(Date.now() - postStart).toBeLessThan(3000);

  const request = await classifyRequest;
  const body = request.postDataJSON() as { commentId?: string };
  expect(body.commentId).toBeTruthy();

  const comment = await frank.getCommentByBody("This serum erases wrinkles overnight.");
  expect(comment?.id).toBe(body.commentId);
});

test("shared review — no Make Changes button; Close is always present; Approve works standalone", async ({
  page,
  frank,
}) => {
  // A can_approve: false link — Close should still be there, Approve
  // shouldn't render at all.
  const plainToken = await frank.createSharedLink();
  await page.goto(`/review/${plainToken}`);
  await page.waitForSelector(".m-top");
  await expect(page.locator('button:has-text("Make Changes")')).toHaveCount(0);
  await expect(page.locator('button:has-text("Close")').first()).toBeVisible();
  await expect(page.locator('button:has-text("Approve")')).toHaveCount(0);

  // A can_approve: true link — Approve is the only real action next to
  // Close, and clicking it still does the real thing (stage 4).
  const token = await frank.createSharedLink({ canApprove: true });
  await page.goto(`/review/${token}`);
  await page.waitForSelector(".m-top");
  await expect(page.locator('button:has-text("Make Changes")')).toHaveCount(0);
  await expect(page.locator('button:has-text("Close")').first()).toBeVisible();

  await page.locator('input[placeholder="Your name"]').first().fill("Guest Reviewer");
  await page.locator('input[placeholder="Your email"]').first().fill("guest@example.com");
  const approveBtn = page.locator('button:has-text("Approve")').first();
  await expect(approveBtn).toBeEnabled();
  await approveBtn.click();
  await expect(page.locator('button:has-text("Approved")').first()).toBeVisible();

  // "Approved" shows before the save finishes; the stage follows.
  await expect.poll(async () => (await frank.getCreativeStatus()).stage).toBe(4);
});

test("shared review — desktop (toggled)", async ({ page, frank }) => {
  const token = await frank.createSharedLink();
  // Wider than the default 1280 viewport — .pw-side (290px) + the 54px gap
  // + .browser (up to 92vw) overflows 1280 once all three are on screen at
  // once, clipping the browser frame. 1600 comfortably fits all three.
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(`/review/${token}`);
  await page.waitForSelector(".pw-seg");
  await page.click('button[data-sv="desktop"]');
  await page.waitForSelector(".dk-list");
  // .br-url renders the live page URL, which contains this test's randomly
  // generated token — genuinely different every run by design, not a
  // rendering difference. Masked rather than faked with a fixed token,
  // since a fixed token risks a unique-constraint collision if this spec
  // ever runs concurrently with itself.
  await expect(page).toHaveScreenshot("shared-review-desktop.png", {
    mask: [page.locator(".br-url")],
  });
});

// Reported directly: a slow Approve, clicked twice, left two "Approved via
// shared review link." comments. Now it shows Approved at once, and the
// database counts it once however it's called (phase53).
test("shared review — Approve shows at once and counts once, even clicked twice", async ({ page, frank }) => {
  const token = await frank.createSharedLink({ canApprove: true });
  await page.goto(`/review/${token}`);
  await page.waitForSelector(".m-top");
  await page.locator('input[placeholder="Your name"]').first().fill("Double Clicker");
  await page.locator('input[placeholder="Your email"]').first().fill("double@example.com");
  const approveBtn = page.locator('button:has-text("Approve")').first();
  await approveBtn.dblclick();
  // Before the page has reloaded the post.
  await expect(page.locator('button:has-text("Approved")').first()).toBeVisible({ timeout: 1_000 });
  await expect.poll(async () => (await frank.getCreativeStatus()).stage).toBe(4);

  // Straight at the database again: approved already, nothing added.
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const again = await anon.rpc("submit_shared_approval", {
    p_token: token,
    p_passcode: null,
    p_creative_id: frank.creativeId,
    p_guest_name: "Double Clicker",
    p_guest_email: "double@example.com",
  });
  expect(again.data).toEqual({ status: "ok", already_approved: true });

  const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const { data: approvals } = await service
    .from("comments")
    .select("id")
    .eq("creative_id", frank.creativeId)
    .eq("body", "Approved via shared review link.");
  expect(approvals).toHaveLength(1);
});
