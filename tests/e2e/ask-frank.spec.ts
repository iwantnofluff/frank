import { test, expect, APP_URL } from "./fixtures";

// Ask Frank (phase147, direct instruction): Help renamed, with "Ask Frank
// anything" at its foot. The answer is stubbed here (a live AI answer is
// never asserted on); the route is checked for who may ask.
const ANSWER = [
  "Move the post to Client Review, then share a link.",
  "",
  "1. Open the post and choose Share.",
  "2. Copy the link and send it.",
  "",
  "See [Send Posts to Your Client for Review](help:send-for-review), or your [team](/settings/team/users). [Show me](showme:send-for-review)",
].join("\n");

test("Ask Frank answers in the panel, with links to a topic, a page and Show Me", async ({ page, frank }) => {
  test.setTimeout(120_000);
  let asked: { question?: string; path?: string } = {};
  await page.route("**/api/ai/ask-frank", async (route) => {
    asked = route.request().postDataJSON();
    const lines = [
      { type: "text", text: ANSWER.slice(0, 40) },
      { type: "text", text: ANSWER.slice(40) },
      { type: "done", text: ANSWER },
    ];
    await route.fulfill({ status: 200, contentType: "application/x-ndjson", body: lines.map((l) => JSON.stringify(l)).join("\n") + "\n" });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await frank.loginAsStaff(page);
  await page.getByRole("button", { name: "Ask Frank", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "Ask Frank" });
  await expect(panel.locator(".help-h")).toContainText("Ask Frank");
  const box = panel.getByLabel("Ask Frank anything");
  await box.fill("How do I send a post for approval?");
  await expect(panel.getByRole("button", { name: "Ask", exact: true })).toBeEnabled({ timeout: 20_000 });
  await box.press("Enter");
  await expect(panel.locator(".ask-q")).toHaveText("How do I send a post for approval?");
  expect(asked.question).toBe("How do I send a post for approval?");
  expect(asked.path).toBe("/dashboard");
  const answer = panel.locator(".ask-a");
  await expect(answer.locator("ol li")).toHaveCount(2);
  await expect(box).toHaveValue("");

  // A topic opens in the panel; Back returns to the conversation.
  await answer.getByRole("button", { name: "Send Posts to Your Client for Review" }).click();
  await expect(panel.locator(".help-title")).toHaveText("Send Posts to Your Client for Review");
  await panel.getByRole("button", { name: "Back" }).click();
  await expect(panel.locator(".ask-q")).toBeVisible();
  // A page link goes there, the panel staying open on the conversation.
  await answer.getByRole("link", { name: "team" }).click();
  await page.waitForURL("**/settings/team/users");
  await expect(panel.locator(".ask-q")).toBeVisible();
  // Home offers the conversation back.
  await panel.getByRole("button", { name: "Back" }).click();
  await expect(panel.getByRole("button", { name: /Your conversation with Frank/ })).toBeVisible();
  await panel.getByRole("button", { name: /Your conversation with Frank/ }).click();
  // Show Me starts the walkthrough.
  await answer.getByRole("button", { name: "Show me" }).click();
  await expect(page.locator(".tour-card .tour-n")).toHaveText(/^1 of \d+$/, { timeout: 60_000 });
  await page.keyboard.press("Escape");
  await expect(page.locator(".tour")).toHaveCount(0);
  await expect(panel.locator(".ask-q")).toBeVisible();
});

test("a client reviewer can ask too, with no Show Me offered", async ({ page, frank }) => {
  await page.route("**/api/ai/ask-frank", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: JSON.stringify({ type: "done", text: "Comment on the post. [Show me](showme:comments)" }) + "\n",
    }),
  );
  await frank.loginAsClient(page);
  await page.getByRole("button", { name: "Ask Frank", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "Ask Frank" });
  await panel.getByLabel("Ask Frank anything").fill("How do I comment?");
  await expect(panel.getByRole("button", { name: "Ask", exact: true })).toBeEnabled({ timeout: 20_000 });
  await panel.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(panel.locator(".ask-a")).toContainText("Comment on the post. Show me");
  await expect(panel.locator(".ask-a").getByRole("button", { name: "Show me" })).toHaveCount(0);
});

test("only people in the workspace can ask, and only with a question", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  const empty = await page.request.post(`${APP_URL}/api/ai/ask-frank`, { data: { agencyId: frank.agencyId, question: "  " } });
  expect(empty.status()).toBe(400);
  const elsewhere = await page.request.post(`${APP_URL}/api/ai/ask-frank`, {
    data: { agencyId: "00000000-0000-0000-0000-000000000000", question: "Hello?" },
  });
  expect(elsewhere.status()).toBe(403);
});
