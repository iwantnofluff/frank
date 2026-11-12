import { test, expect, APP_URL } from "./fixtures";

// Settings' X, top right (direct instruction): back to the page Workspace
// or Client Settings was opened from, however many of its pages were
// visited; opened straight from a link, the clients list or the client.
test("the X closes Workspace and Client Settings, back to where they were opened from", async ({ page, frank }) => {
  test.setTimeout(90_000);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  await expect(page.getByRole("button", { name: "Settings", exact: true })).toBeVisible({ timeout: 20_000 });

  // Workspace Settings, through two of its pages, then the X.
  await page.goto(`${APP_URL}/settings/general/preferences`);
  await page.getByRole("link", { name: "Statuses", exact: true }).click();
  await page.waitForURL("**/settings/general/statuses");
  await page.getByRole("button", { name: "Close Workspace Settings" }).click();
  await page.waitForURL(`**/projects/${frank.projectId}`);

  // Client Settings the same way.
  await page.goto(`${APP_URL}/clients/${frank.clientId}/settings/details`);
  await page.getByRole("link", { name: "Statuses", exact: true }).click();
  await page.getByRole("button", { name: "Close Client Settings" }).click();
  await page.waitForURL(`**/projects/${frank.projectId}`);

  // Opened straight from a link, in a new tab: the client, or the clients list.
  const fresh = await page.context().newPage();
  await fresh.goto(`${APP_URL}/clients/${frank.clientId}/settings/details`);
  await fresh.getByRole("button", { name: "Close Client Settings" }).click();
  await fresh.waitForURL(`**/clients/${frank.clientId}`);
  const fresh2 = await page.context().newPage();
  await fresh2.goto(`${APP_URL}/settings/general/preferences`);
  await fresh2.getByRole("button", { name: "Close Workspace Settings" }).click();
  await fresh2.waitForURL("**/dashboard");
});
