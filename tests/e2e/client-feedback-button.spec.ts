import { test, expect, goToMonth } from "./fixtures";
import { admin } from "./sweep";

// Add Feedback (direct instruction): in the table's Client Feedback column,
// a client's only, straight into the post's comment box, where they can
// comment (Concept or Client Review, phase168), with the green Approve
// Concept beside it while a concept waits. A client has no Add, Update or
// Copy buttons anywhere on the table.
test("a client's only table buttons are Add Feedback and Approve Concept, into the comment box", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const concept = await frank.createCreativeAtStage(1, "Concept Post");
  await admin.from("creatives").update({ concept: "Rain on the window.", approach_notes: ["Warmth"] }).eq("id", concept);
  const review = await frank.createCreativeAtStage(4, "Review Post");
  await frank.createCopyVersion(review, 1, { caption: "A warm cup on a cold day." });
  await frank.createCreativeAtStage(5, "Approved Post");

  await frank.loginAsClient(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  const buttons = (name: string) =>
    page.locator("tr[data-row]", { hasText: name }).locator("button:not(.pname), a.copychip").allTextContents();
  await expect(page.locator("tr[data-row]", { hasText: "Review Post" }).getByRole("link", { name: "Add Feedback" })).toBeVisible({ timeout: 15_000 });
  // Concept's own Approve Concept, then Client Feedback's pair.
  expect((await buttons("Concept Post")).map((t) => t.trim())).toEqual(["Approve Concept", "Add Feedback", "Approve Concept"]);
  expect((await buttons("Review Post")).map((t) => t.trim())).toEqual(["Add Feedback"]);
  expect(await buttons("Approved Post")).toEqual([]);

  await page.locator("tr[data-row]", { hasText: "Review Post" }).getByRole("link", { name: "Add Feedback" }).click();
  await page.waitForURL(new RegExp(`/creatives/${review}$`));
  await expect(page.getByPlaceholder("Add a comment…")).toBeFocused({ timeout: 15_000 });
});

test("the team has no Add Feedback on the table", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await frank.createCreativeAtStage(4, "Review Post");
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  await expect(page.locator("tr[data-row]", { hasText: "Review Post" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: "Add Feedback" })).toHaveCount(0);
});

// Written in the cell itself (direct instruction): a new comment on the
// post, from the client, posted with Post or Enter; only where they can
// comment, and never for the team.
test("a client writes feedback in the Client Feedback cell", async ({ page, browser, frank }) => {
  test.setTimeout(120_000);
  const review = await frank.createCreativeAtStage(4, "Review Post");
  await frank.createCreativeAtStage(5, "Approved Post");
  await frank.loginAsClient(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  const row = page.locator("tr[data-row]", { hasText: "Review Post" });
  const box = row.getByLabel("Write feedback");
  await expect(box).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("tr[data-row]", { hasText: "Approved Post" }).getByLabel("Write feedback")).toHaveCount(0);

  await box.fill("Can the logo be bigger?");
  await row.getByRole("button", { name: "Post", exact: true }).click();
  await expect(row.locator(".feedback-note")).toContainText("Can the logo be bigger?", { timeout: 15_000 });
  await expect(box).toHaveValue("");
  await box.fill("And warmer colours");
  await box.press("Enter");
  await expect(row.locator(".feedback-note")).toContainText("And warmer colours", { timeout: 15_000 });
  await expect(row.locator(".feedback-note")).not.toContainText("Can the logo");
  // Still on the table: the row's own click didn't open the post.
  expect(page.url()).toContain(`/projects/${frank.projectId}`);
  const { data } = await admin.from("comments").select("body, visibility").eq("creative_id", review).order("created_at");
  expect(data).toEqual([
    { body: "Can the logo be bigger?", visibility: "public" },
    { body: "And warmer colours", visibility: "public" },
  ]);

  const team = await (await browser.newContext()).newPage();
  await frank.loginAsStaff(team);
  await team.goto(`/projects/${frank.projectId}`);
  await team.waitForSelector(".tblwrap, .empty");
  await goToMonth(team, "March 2027");
  await expect(team.locator("tr[data-row]", { hasText: "Review Post" })).toBeVisible({ timeout: 15_000 });
  await expect(team.getByLabel("Write feedback")).toHaveCount(0);
});
