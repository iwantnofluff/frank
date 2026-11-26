import { test, expect, goToMonth } from "./fixtures";
import { admin } from "./sweep";

// Add Client Feedback (direct instruction): in the table's Client Feedback
// column, straight into the post's comment box. A client gets it only where
// they can comment (Concept or Client Review, phase168), and no Add, Update
// or Copy buttons anywhere on the table; the team gets it on every post,
// commenting on the client's behalf.
test("a client's only table buttons are Add Client Feedback (and Approve Concept), into the comment box", async ({ page, frank }) => {
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
  await expect(page.locator("tr[data-row]", { hasText: "Review Post" }).getByRole("link", { name: "Add Client Feedback" })).toBeVisible({ timeout: 15_000 });
  expect((await buttons("Concept Post")).map((t) => t.trim())).toEqual(["Approve Concept", "Add Client Feedback"]);
  expect((await buttons("Review Post")).map((t) => t.trim())).toEqual(["Add Client Feedback"]);
  expect(await buttons("Approved Post")).toEqual([]);

  await page.locator("tr[data-row]", { hasText: "Review Post" }).getByRole("link", { name: "Add Client Feedback" }).click();
  await page.waitForURL(new RegExp(`/creatives/${review}$`));
  await expect(page.getByPlaceholder("Add a comment…")).toBeFocused({ timeout: 15_000 });
});

test("the team's Add Client Feedback opens the comment box on the client's behalf", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const approved = await frank.createCreativeAtStage(5, "Approved Post");
  await frank.loginAsStaff(page);
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  await page.locator("tr[data-row]", { hasText: "Approved Post" }).getByRole("link", { name: "Add Client Feedback" }).click();
  await page.waitForURL(new RegExp(`/creatives/${approved}$`));
  await expect(page.getByPlaceholder("Add a comment…")).toBeFocused({ timeout: 15_000 });
  await expect(page.getByRole("checkbox", { name: /On behalf of/ })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Private" })).not.toBeChecked();
});
