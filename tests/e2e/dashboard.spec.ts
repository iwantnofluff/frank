import { test, expect } from "./fixtures";

test("dashboard — clients list", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto("/dashboard");
  // .pad .h1 is static; wait for the actual client list/empty state so this
  // can't race ahead of useClients() the way client-workspace/project-table/
  // settings-knowledge did.
  await page.waitForSelector(".clients, .empty");
  await expect(page).toHaveScreenshot("dashboard.png");
});
