import { test, expect, APP_URL } from "./fixtures";
import { admin } from "./sweep";

// Share on the Table (direct instruction): the Table's own link, for clients
// who sign in. Signed out, it asks to sign in and comes back; off the
// project, it says the Table isn't available.
test("Share copies the Table's link, which a client signs in to open", async ({ page, frank, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  await page.getByRole("button", { name: "Share Table" }).click();
  const dlg = page.getByRole("dialog", { name: "Share E2E Test Project" });
  await expect(dlg.locator(".sharepeople li")).toHaveCount(1);
  // As on a review link's Share window: three ways, each message shown on
  // hover as it will paste.
  await expect(dlg.locator(".sharecopy .btn")).toHaveText(["Link + Instructions", "Link + Review", "Just Link"]);
  for (const [label, line] of [
    ["Link + Instructions", "2. Log in with the email we invited you with."],
    ["Link + Review", "Log in to see everything planned"],
  ] as const) {
    await dlg.getByRole("button", { name: label }).hover();
    await expect(page.getByRole("tooltip")).toContainText(line);
    await dlg.getByRole("button", { name: label }).click();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain(`Your content planner "E2E Test Project" is ready for review:\n\n${APP_URL}/projects/${frank.projectId}\n`);
    expect(text).toContain(line);
    expect(text).not.toContain("Approve");
  }
  await dlg.getByRole("button", { name: "Just Link" }).click();
  await expect(dlg.getByRole("button", { name: "Copied" })).toBeDisabled();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toBe(`${APP_URL}/projects/${frank.projectId}`);

  await context.clearCookies();
  await page.goto(link);
  await page.waitForURL(/\/login\?redirect_to=/);
  await page.fill('input[type="email"]', frank.clientEmail);
  await page.fill('input[type="password"]', frank.clientPassword);
  await page.keyboard.press("Enter");
  await page.waitForURL(new RegExp(`/projects/${frank.projectId}$`));
  await expect(page.getByRole("heading", { name: /E2E Test Project/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Share Table" })).toHaveCount(0);
});

test("a client not on the project is told the Table isn't available", async ({ page, frank }) => {
  const { data: members } = await admin.from("memberships").select("id").eq("client_id", frank.clientId);
  const { data: removed, error } = await admin
    .from("project_access")
    .delete()
    .in("membership_id", (members ?? []).map((m) => m.id))
    .eq("project_id", frank.projectId)
    .select("id");
  expect(error).toBeNull();
  expect(removed?.length).toBeGreaterThan(0);

  await frank.loginAsClient(page);
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  await expect(page.getByText("This Table isn’t available")).toBeVisible({ timeout: 5000 });
});
