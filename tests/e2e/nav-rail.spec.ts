import { test, expect, APP_URL } from "./fixtures";
import type { Page } from "@playwright/test";

async function railLinks(page: Page) {
  const rail = page.getByRole("navigation", { name: "Main" });
  // Settings is staff-only and resolves a moment after the page — wait for
  // the rail to settle on its final set before reading it.
  await page.waitForTimeout(300);
  return rail.locator("a.rbtn").evaluateAll((links) =>
    links.map((a) => `${a.getAttribute("title")} -> ${new URL((a as HTMLAnchorElement).href).pathname}`),
  );
}

test("the rail follows where you are inside a client", async ({ page, frank }) => {
  await frank.loginAsStaff(page);

  await page.goto(`${APP_URL}/clients/${frank.clientId}`);
  await expect(page.locator("#navSet")).toBeVisible();
  expect(await railLinks(page)).toEqual([
    "Clients -> /dashboard",
    `Knowledge -> /clients/${frank.clientId}/knowledge`,
    "Settings -> /settings",
  ]);

  await page.goto(`${APP_URL}/projects/${frank.projectId}`);
  await expect(page.getByRole("link", { name: "Projects" })).toBeVisible();
  await expect(page.locator("#navSet")).toBeVisible();
  expect(await railLinks(page)).toEqual([
    "Clients -> /dashboard",
    `Projects -> /clients/${frank.clientId}`,
    `Knowledge -> /clients/${frank.clientId}/knowledge`,
    "Settings -> /settings",
  ]);

  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await expect(page.getByRole("link", { name: "Calendar" })).toBeVisible();
  await expect(page.locator("#navSet")).toBeVisible();
  expect(await railLinks(page)).toEqual([
    "Clients -> /dashboard",
    `Projects -> /clients/${frank.clientId}`,
    `Calendar -> /projects/${frank.projectId}`,
    `Knowledge -> /clients/${frank.clientId}/knowledge`,
    "Settings -> /settings",
  ]);

  // Calendar opens this post's own project table.
  await page.getByRole("link", { name: "Calendar" }).click();
  await page.waitForURL(`${APP_URL}/projects/${frank.projectId}`);
  await page.getByRole("link", { name: "Projects" }).click();
  await page.waitForURL(`${APP_URL}/clients/${frank.clientId}`);
});

test("a client-side member gets the same rail, without Settings", async ({ page, frank }) => {
  await frank.loginAsClient(page);
  await page.goto(`${APP_URL}/creatives/${frank.creativeId}`);
  await expect(page.getByRole("link", { name: "Calendar" })).toBeVisible();
  expect(await railLinks(page)).toEqual([
    "Clients -> /dashboard",
    `Projects -> /clients/${frank.clientId}`,
    `Calendar -> /projects/${frank.projectId}`,
    `Knowledge -> /clients/${frank.clientId}/knowledge`,
  ]);
});
