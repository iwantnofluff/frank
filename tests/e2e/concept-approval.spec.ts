import { createClient } from "@supabase/supabase-js";
import { test, expect, goToMonth } from "./fixtures";

// Approving a concept (phase115, direct instruction): the client or anyone
// on the team, from the post's comments or the table's Concept & Reference
// cell. It moves the post to In Production and records the approval as a
// comment in the approver's name.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const conceptPost = async (frank: { createCreativeAtStage: (stage: number, name?: string) => Promise<string> }, name: string) => {
  const id = await frank.createCreativeAtStage(1, name);
  await admin.from("creatives").update({ concept: "Rain on the window, a warm cup." }).eq("id", id);
  return id;
};

test("the team approves a concept from the post's comments", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const id = await conceptPost(frank, "Team Approves Concept");
  // A written Concept no longer moves it on by itself.
  expect((await admin.from("creatives").select("stage").eq("id", id).single()).data!.stage).toBe(1);

  await frank.loginAsStaff(page);
  await page.goto(`/creatives/${id}`);
  // Nothing to look at but the brief yet: it opens there.
  await expect(page.getByRole("button", { name: "Brief" }).first()).toHaveAttribute("aria-current", "true", { timeout: 15_000 });
  await page.getByRole("button", { name: "Approve Concept" }).click();
  await expect(page.locator(".cmt", { hasText: "Approved Concept" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Approve Concept" })).toHaveCount(0);
  const { data: c } = await admin.from("creatives").select("stage").eq("id", id).single();
  expect(c!.stage).toBe(2);
  const { data: cm } = await admin.from("comments").select("body, visibility").eq("creative_id", id);
  expect(cm).toEqual([{ body: "Approved Concept", visibility: "public" }]);

  // The team's approval stays on the post's page: Client Feedback is the client's.
  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  const row = page.locator("tr[data-row]", { hasText: "Team Approves Concept" });
  await expect(row.locator(".stg")).toContainText("In Production", { timeout: 15_000 });
  await expect(row.locator(".feedback-note")).toHaveCount(0);
});

test("a client approves a concept from the table, and it shows as their feedback", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const id = await conceptPost(frank, "Client Approves Concept");
  await frank.loginAsClient(page);

  // On the post's page, in Concept, the client has the comments and Approve.
  await page.goto(`/creatives/${id}`);
  await expect(page.getByRole("button", { name: "Approve Concept" })).toBeVisible({ timeout: 15_000 });

  await page.goto(`/projects/${frank.projectId}`);
  await page.waitForSelector(".tblwrap, .empty");
  await goToMonth(page, "March 2027");
  const row = page.locator("tr[data-row]", { hasText: "Client Approves Concept" });
  await row.getByRole("button", { name: "Approve Concept" }).click();
  await expect(row.getByRole("button", { name: "Approve Concept" })).toHaveCount(0, { timeout: 15_000 });
  const { data: client } = await admin.from("users").select("id, name").eq("email", frank.clientEmail).single();
  // Client Feedback: their name, small, over what they said.
  const note = row.locator(".feedback-note");
  await expect(note).toContainText("Approved Concept");
  await expect(note).not.toContainText("Client Approved Concept");
  await expect(note.locator(".cc-v")).toHaveText(client!.name);
  await expect(row.locator(".stg")).toContainText("In Production");

  const { data: cm } = await admin.from("comments").select("body, author_id").eq("creative_id", id);
  expect(cm).toEqual([{ body: "Client Approved Concept", author_id: client!.id }]);
});
