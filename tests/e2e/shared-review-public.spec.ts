import { createClient } from "@supabase/supabase-js";
import { test, expect, PHONE_VIEWPORT } from "./fixtures";

// No session at all — a real share-link visitor. The visitor's own screen
// picks the layout (direct instruction): a phone gets the phone layout, a
// wider screen the desktop one, each filling the window with no frame and
// no preview switch. These run at a phone's size unless they say otherwise.
test.use({ viewport: PHONE_VIEWPORT });

test("shared review — on a phone, the phone layout fills the screen", async ({ page, frank }) => {
  const token = await frank.createSharedLink();
  await page.goto(`/review/${token}`);
  // The page renders for the loading state too ("Loading…", nothing else)
  // — wait for real content.
  await page.waitForSelector(".m-top");
  await expect(page.locator(".dk-list")).toHaveCount(0);
  await expect(page.getByText("Shared review", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Desktop" })).toHaveCount(0);
  const box = await page.locator(".phone").boundingBox();
  expect(box).toEqual({ x: 0, y: 0, width: PHONE_VIEWPORT.width, height: PHONE_VIEWPORT.height });
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

test("shared review — on a computer, the desktop layout fills the window", async ({ page, frank }) => {
  const token = await frank.createSharedLink();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/review/${token}`);
  await page.waitForSelector(".dk-list");
  await expect(page.locator(".m-top")).toHaveCount(0);
  await expect(page.getByText("Shared review", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Phone" })).toHaveCount(0);
  const box = await page.locator(".browser").boundingBox();
  expect(box).toEqual({ x: 0, y: 0, width: 1440, height: 900 });
  await expect(page).toHaveScreenshot("shared-review-desktop.png");

  // Narrowed to a phone's width, it becomes the phone layout.
  await page.setViewportSize(PHONE_VIEWPORT);
  await page.waitForSelector(".m-top");
  await expect(page.locator(".dk-list")).toHaveCount(0);
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

// The Feed (phase67, decided directly): the project's other posts show by
// stage only, never by name, and a post in the link opens from its tile and
// shows how many comments it has.
test("shared review — the feed shows other posts by stage only, and opens this link's posts", async ({ page, frank }) => {
  await frank.createCreativeAtStage(1, "Unshared concept post");
  await frank.createCreativeAtStage(2, "Unshared internal post");
  await frank.insertCommentAsStaff("A public note", "public");
  const token = await frank.createSharedLink();

  // What the page is sent: nothing of the unshared posts but their stage.
  const res = await page.request.post("/api/shared-review", { data: { token } });
  const raw = await res.text();
  expect(raw).not.toContain("Unshared");
  const feed = (JSON.parse(raw) as { feed: { id: string | null; stage: number }[] }).feed;
  expect(feed.filter((e) => e.id === null).map((e) => e.stage).sort()).toEqual([1, 2]);
  expect(feed.filter((e) => e.id !== null)).toHaveLength(1);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/review/${token}`);
  // The list marks the post's comments.
  await expect(page.locator(".dk-item .cmtcount")).toHaveText("1");
  await page.locator(".dk-nav").getByRole("button", { name: "Feed" }).click();
  const grid = page.locator(".dk-main .feedgrid");
  await expect(grid.locator(".sharedfeed-stage")).toHaveCount(2);
  expect((await grid.locator(".sharedfeed-stage").allTextContents()).sort()).toEqual(["In Progress", "Internal Review"]);
  await expect(grid).not.toContainText("Unshared");
  await expect(grid.locator(".sharedfeed-planned .cmtcount")).toHaveText("1");
  // Its tile opens the post.
  await grid.locator(".sharedfeed-planned").click();
  await expect(page.locator(".dk-card .ct")).toHaveText("E2E Test Creative");
});
