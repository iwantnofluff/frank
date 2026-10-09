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
  ]);

  // The list is the whole set (phase77): no "Someone else", and nowhere to
  // type a name or email of your own.
  await expect(page.locator('input[placeholder="Your name"]')).toHaveCount(0);
  await expect(page.locator('input[placeholder="Your email"]')).toHaveCount(0);
  await expect(page.locator(".m-bar input")).toHaveCount(0);

  // Once a comment is posted under a picked name, the picker itself is
  // replaced by the "Commenting as X" pill.
  await picker.selectOption({ label: "Jonathan Lead" });
  await page.fill("textarea", "Looks good, approved from my side.");
  await page.click('button:has-text("Post")');
  await expect(page.locator("text=Commenting as").first()).toBeVisible();
  await expect(page.locator("b", { hasText: "Jonathan Lead" }).first()).toBeVisible();
});

test("shared review — a plain login link is present but never required", async ({ page, frank }) => {
  await frank.createClientContact("Guest Reviewer", "guest@example.com");
  const token = await frank.createSharedLink();
  await page.goto(`/review/${token}`);
  await page.waitForSelector(".m-top");

  const loginLink = page.locator('a:has-text("Log in")').first();
  await expect(loginLink).toHaveAttribute("href", "/login");

  // Commenting without ever touching that link still works.
  await page.locator("select").first().selectOption({ label: "Guest Reviewer" });
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
  await frank.createClientContact("Guest Reviewer", "guest@example.com");
  const token = await frank.createSharedLink();
  await page.goto(`/review/${token}`);
  await page.waitForSelector(".m-top");

  const classifyRequest = page.waitForRequest(
    (req) => req.url().includes("/api/ai/classify-comment") && req.method() === "POST",
  );

  await page.locator("select").first().selectOption({ label: "Guest Reviewer" });
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
  await frank.createClientContact("Guest Reviewer", "guest@example.com");
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

  await page.locator("select").first().selectOption({ label: "Guest Reviewer" });
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
  await frank.createClientContact("Double Clicker", "double@example.com");
  const token = await frank.createSharedLink({ canApprove: true });
  await page.goto(`/review/${token}`);
  await page.waitForSelector(".m-top");
  await page.locator("select").first().selectOption({ label: "Double Clicker" });
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

// The Feed (phase67, then phase68, decided directly): the project's other
// posts show by stage, named only while in Internal Review, never with
// artwork or a way in; a post in the link shows its thumbnail, opens from
// its tile and shows how many comments it has.
test("shared review — the feed shows other posts by stage, and opens this link's posts", async ({ page, frank }) => {
  await frank.createCreativeAtStage(1, "Unshared concept post");
  await frank.createCreativeAtStage(2, "Unshared internal post");
  await frank.insertCommentAsStaff("A public note", "public");
  const token = await frank.createSharedLink();

  // What the page is sent about the unshared posts: stage and name only.
  const res = await page.request.post("/api/shared-review", { data: { token } });
  const body = JSON.parse(await res.text()) as {
    creatives: { name: string }[];
    feed: { id: string | null; name?: string | null; stage: number }[];
  };
  const unshared = body.feed.filter((e) => e.id === null);
  expect(unshared.map((e) => [e.stage, e.name]).sort()).toEqual([
    [1, "Unshared concept post"],
    [2, "Unshared internal post"],
  ]);
  expect(body.creatives.map((c) => c.name)).toEqual(["E2E Test Creative"]);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/review/${token}`);
  // The list marks the post's comments.
  await expect(page.locator(".dk-item .cmtcount")).toHaveText("1");
  await page.locator(".dk-nav").getByRole("button", { name: "Feed" }).click();
  const grid = page.locator(".dk-main .feedgrid");
  const stageTiles = grid.locator(".sharedfeed-stage");
  await expect(stageTiles).toHaveCount(2);
  expect((await stageTiles.locator(".stagepill").allTextContents()).sort()).toEqual(["Internal Review", "Internal Review"]);
  expect((await stageTiles.locator(".sharedfeed-name").allTextContents()).sort()).toEqual(["Unshared concept post", "Unshared internal post"]);
  // The shared post: its stage pill (Client Review) and its comment count.
  await expect(grid.locator(".sharedfeed-planned .stagepill")).toHaveText("Client Review");
  await expect(grid.locator(".sharedfeed-planned .cmtcount")).toHaveText("1");
  // Its tile opens the post.
  await grid.locator(".sharedfeed-planned").click();
  await expect(page.locator(".dk-card .ct")).toHaveText("E2E Test Creative");
});

// Reported directly: a No Fluff link opened as someone remembered from a
// Casa Carigar link in the same browser. The name is remembered per client,
// and "Not you?" lets someone else on the browser give their own.
test("shared review — a name given on one client's link isn't assumed on another's", async ({ page, frank }) => {
  test.setTimeout(60_000);
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  const { data: other } = await admin.from("clients").insert({ agency_id: frank.agencyId, name: "E2E Second Client" }).select("id").single();
  const { data: project } = await admin.from("projects").insert({ client_id: other!.id, name: "E2E Second Project", delivery: "scheduled" }).select("id").single();
  const made = await admin.from("creatives").insert({ project_id: project!.id, name: "E2E Second Creative", format: "ig_feed", stage: 3, created_by: staffId, scheduled_at: new Date(Date.now() + 14 * 86_400_000).toISOString() }).select("id");
  if (made.error) throw made.error;
  const otherToken = `e2e-other-${Date.now()}`;
  const { error } = await admin.from("shared_links").insert({ agency_id: frank.agencyId, project_id: project!.id, token: otherToken, scope: "all", requires_passcode: false, can_approve: false, created_by: staffId });
  if (error) throw error;
  // Each client has its own person on its list (phase77).
  const listed = await admin.from("client_contacts").insert({ agency_id: frank.agencyId, client_id: other!.id, name: "Second Client Person", email: "second@example.com" });
  if (listed.error) throw listed.error;
  await frank.createClientContact("First Client Person", "first@example.com");

  const token = await frank.createSharedLink();
  await page.goto(`/review/${token}`);
  await page.waitForSelector(".m-top");
  await page.locator("select").first().selectOption({ label: "First Client Person" });
  await page.fill("textarea", "A note from the first client.");
  await page.click('button:has-text("Post")');
  await expect(page.locator("b", { hasText: "First Client Person" }).first()).toBeVisible();

  // Another client's link: nobody assumed, and only its own people offered.
  await page.goto(`/review/${otherToken}`);
  await page.waitForSelector(".m-top");
  await expect(page.locator("text=Commenting as")).toHaveCount(0);
  await expect(page.locator("select").first().locator("option")).toHaveText(["Who are you?", "Second Client Person"]);

  // Back on the first: still them, until "Not you?".
  await page.goto(`/review/${token}`);
  await page.waitForSelector(".m-top");
  await expect(page.locator("b", { hasText: "First Client Person" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Not you?" }).first().click();
  await expect(page.locator("text=Commenting as")).toHaveCount(0);
  const picker = page.locator("select").first();
  await expect(picker).toBeVisible();
  await expect(picker).toHaveValue("");
  await expect(picker.locator("option:checked")).toHaveText("Who are you?");
});

// Only the client's own people comment on a link (phase77, decided
// directly): the database refuses anyone else, and a link whose client has
// nobody on its list says so instead of offering a picker.
test("shared review — only the client's own people can comment", async ({ page, frank }) => {
  test.setTimeout(60_000);
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });

  // Straight at the database, as someone not on the list.
  await frank.createClientContact("Listed Person", "listed@example.com");
  const token = await frank.createSharedLink();
  const refused = await anon.rpc("submit_shared_comment", {
    p_token: token,
    p_passcode: null,
    p_creative_id: frank.creativeId,
    p_guest_name: "Stranger",
    p_guest_email: "stranger@example.com",
    p_body: "From someone not on the list",
  });
  expect(refused.error).toBeNull();
  expect(refused.data).toEqual({ status: "not_on_client" });
  const { data: landed } = await admin
    .from("comments")
    .select("id")
    .eq("creative_id", frank.creativeId)
    .eq("body", "From someone not on the list");
  expect(landed).toHaveLength(0);

  // A client with nobody on its list: the link says who can comment.
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  const { data: empty } = await admin.from("clients").insert({ agency_id: frank.agencyId, name: "E2E Empty Client" }).select("id").single();
  const { data: project } = await admin.from("projects").insert({ client_id: empty!.id, name: "E2E Empty Project", delivery: "scheduled" }).select("id").single();
  const made = await admin.from("creatives").insert({ project_id: project!.id, name: "E2E Empty Creative", format: "ig_feed", stage: 3, created_by: staffId, scheduled_at: new Date(Date.now() + 14 * 86_400_000).toISOString() }).select("id");
  if (made.error) throw made.error;
  const emptyToken = `e2e-empty-${Date.now()}`;
  const { error } = await admin.from("shared_links").insert({ agency_id: frank.agencyId, project_id: project!.id, token: emptyToken, scope: "all", requires_passcode: false, can_approve: true, created_by: staffId });
  if (error) throw error;

  await page.goto(`/review/${emptyToken}`);
  await page.waitForSelector(".m-top");
  await expect(page.locator(".m-noone")).toHaveText(
    "Only E2E Empty Client's people can comment here. Ask E2E Test Agency to add you as a Client of E2E Empty Client.",
  );
  await expect(page.locator(".m-bar select")).toHaveCount(0);
  // Nothing to comment as, so no comment box.
  await expect(page.locator(".m-bar textarea")).toHaveCount(0);
  await expect(page.locator('.m-bar button:has-text("Post")')).toHaveCount(0);
  await expect(page.locator('button:has-text("Approve")').first()).toBeDisabled();
});

// Decided directly: on a review link the client's and project's names open
// their pages in Frank, asking anyone signed out to sign in first; for the
// workspace's team, the post's name opens its own page.
test("shared review — names link into Frank: sign in first, and the post for the team", async ({ page, browser, frank }) => {
  test.setTimeout(90_000);
  const token = await frank.createSharedLink();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/review/${token}`);
  const head = page.locator(".dk-list .rv-client");
  await expect(head.getByRole("link", { name: "E2E Test Client" })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".dk-card .ct a")).toHaveCount(0);
  await head.getByRole("link", { name: "E2E Test Project" }).click();
  const win = page.getByRole("dialog", { name: "Sign in to Frank" });
  await expect(win).toContainText("To open E2E Test Project in Frank, sign in.");
  await expect(win.getByRole("link", { name: "Sign In" })).toHaveAttribute("href", /\/login\?redirect_to=%2Fprojects%2F/);
  await win.getByRole("button", { name: "Cancel" }).click();
  await expect(win).toHaveCount(0);

  // The team: the post's name opens its page; the client's name goes straight there.
  await frank.loginAsStaff(page);
  await page.goto(`/review/${token}`);
  await expect(page.locator(".dk-card .ct a")).toHaveAttribute("href", `/creatives/${frank.creativeId}`, { timeout: 20_000 });
  await page.locator(".dk-list .rv-client").getByRole("link", { name: "E2E Test Client" }).click();
  await page.waitForURL(`**/clients/${frank.clientId}`, { timeout: 20_000 });

  // A Client: the names work, the post's name stays text.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const client = await ctx.newPage();
  await frank.loginAsClient(client);
  await client.goto(`/review/${token}`);
  await expect(client.locator(".dk-list .rv-client").getByRole("link", { name: "E2E Test Project" })).toBeVisible({ timeout: 20_000 });
  await expect(client.locator(".dk-card .ct")).toContainText("E2E Test Creative");
  await expect(client.locator(".dk-card .ct a")).toHaveCount(0);
  await ctx.close();
});
