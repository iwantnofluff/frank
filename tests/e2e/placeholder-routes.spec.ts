import { test, expect } from "./fixtures";

// Calendar, Analytics and Visibility had rail links pointing at routes
// that didn't exist at all — a real HTTP 404 (Next's bare, unstyled
// default page: no .rail, no topbar) rather than the app shell. Knowledge
// already has real content at /clients/[id]/knowledge; included here so
// one spec asserts the whole rail's reachability together.

const SHELL_SCREENS: { path: (clientId: string) => string; heading: string }[] = [
  { path: () => "/calendar", heading: "Calendar" },
  { path: () => "/analytics", heading: "Analytics" },
  { path: (clientId) => `/clients/${clientId}/knowledge`, heading: "Knowledge" },
];

for (const { path, heading } of SHELL_SCREENS) {
  test(`${heading} renders the app shell, not a 404`, async ({ page, frank }) => {
    await frank.loginAsStaff(page);
    await page.goto(path(frank.clientId));
    await expect(page.locator(".rail")).toBeVisible();
    await expect(page.locator(".topbar")).toBeVisible();
    await expect(page.locator(".h1, h1").first()).toContainText(heading);
  });
}

test("Visibility renders the app shell for staff, not a 404", async ({ page, frank }) => {
  await frank.loginAsStaff(page);
  await page.goto("/visibility");
  await expect(page.locator(".rail")).toBeVisible();
  await expect(page.locator(".topbar")).toBeVisible();
  await expect(page.locator(".h1, h1").first()).toContainText("Visibility");
});

// Two layers, same as Settings: NavRail hides the link, and the page
// itself guards a direct URL — a client-role session must not reach even
// this placeholder, since it's the screen where staff would configure
// what a client can see.
test("Visibility redirects a real client-role session away", async ({ page, frank }) => {
  await frank.loginAsClient(page);
  await page.goto("/visibility");
  await page.waitForURL(/\/dashboard$/, { timeout: 15000 });
});
