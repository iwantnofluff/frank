import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import { makeEmailChangeToken } from "../../lib/admin/email-change-token";

// The admin area's menu and its own Settings: notifications, password,
// sign-in email, other sessions (direct instruction, 3 Oct 2026).

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ADMIN = "http://admin.frank.localhost:3000";
const PASSWORD = "E2e-Admin-Test-1234!";

async function makePlatformAdmin() {
  const email = `e2e-platform-admin-${Date.now()}@example.invalid`;
  const { data } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  const id = data.user!.id;
  await admin.from("users").insert({ id, email, name: "E2E Platform Admin" });
  await admin.from("platform_admins").insert({ user_id: id });
  return {
    id,
    email,
    async cleanup() {
      await admin.from("platform_admins").delete().eq("user_id", id);
      await admin.from("users").delete().eq("id", id);
      await admin.auth.admin.deleteUser(id);
    },
  };
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${ADMIN}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${ADMIN}/admin`, { timeout: 20_000 });
}

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

test("the admin menu, a whole row opening its agency, and the plan column", async ({ page, frank }) => {
  test.setTimeout(90_000);
  const pa = await makePlatformAdmin();
  try {
    await signIn(page, pa.email, PASSWORD);
    const nav = page.getByRole("navigation", { name: "Admin sections" });
    await expect(nav.getByRole("link", { name: "Agencies" })).toHaveAttribute("aria-current", "true");
    await nav.getByRole("button", { name: "Settings", exact: true }).click();
    await nav.getByRole("link", { name: "Notifications" }).click();
    await page.waitForURL(`${ADMIN}/admin/settings/notifications`);
    await expect(nav.getByRole("link", { name: "Notifications" })).toHaveAttribute("aria-current", "true");
    await nav.getByRole("button", { name: "Hide settings menu" }).click();
    await expect(nav.getByRole("button", { name: "Dashboard" })).toHaveCount(0);
    await nav.getByRole("button", { name: "Show settings menu" }).click();

    await page.goto(`${ADMIN}/admin`);
    const row = page.locator(".admintbl tr", { has: page.locator(`a[href="/admin/agencies/${frank.agencyId}"]`) });
    await expect(row.locator("td").nth(1)).toContainText("Starter");
    // Anywhere on the row, not just the name.
    await row.locator("td").nth(4).click();
    await page.waitForURL(`${ADMIN}/admin/agencies/${frank.agencyId}`, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "E2E Test Agency" })).toBeVisible();
  } finally {
    await pa.cleanup();
  }
});

test("notifications are switched off and stay off", async ({ page }) => {
  const pa = await makePlatformAdmin();
  try {
    await signIn(page, pa.email, PASSWORD);
    await page.goto(`${ADMIN}/admin/settings/notifications`);
    const toggle = page.getByRole("button", { name: "Plan changes" });
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await page.reload();
    await expect(page.getByRole("button", { name: "Plan changes" })).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("button", { name: "New sign-ups" })).toHaveAttribute("aria-pressed", "true");
    const { data } = await admin.auth.admin.getUserById(pa.id);
    expect(data.user!.app_metadata.notifications).toEqual({ plan_changes: false });
  } finally {
    await pa.cleanup();
  }
});

test("password: the current one is checked, then the new one signs in", async ({ page }) => {
  const pa = await makePlatformAdmin();
  try {
    await signIn(page, pa.email, PASSWORD);
    await page.goto(`${ADMIN}/admin/settings/security`);
    const form = page.locator("form", { hasText: "Password" }).first();
    await form.getByLabel("Current password").fill("not-it-at-all");
    await form.getByLabel("New password", { exact: true }).fill("E2e-New-Pass-1234!");
    await form.getByLabel("New password again").fill("E2e-New-Pass-1234!");
    await form.getByRole("button", { name: "Change Password" }).click();
    await expect(form.locator(".autherr")).toHaveText("Your current password isn't right");
    await form.getByLabel("Current password").fill(PASSWORD);
    await form.getByRole("button", { name: "Change Password" }).click();
    await expect(form.getByText("Password changed.")).toBeVisible();
    expect((await anon().auth.signInWithPassword({ email: pa.email, password: "E2e-New-Pass-1234!" })).error).toBeNull();
    expect((await anon().auth.signInWithPassword({ email: pa.email, password: PASSWORD })).error).not.toBeNull();
  } finally {
    await pa.cleanup();
  }
});

test("sign-in email: changes only through the link sent to the new address", async ({ page }) => {
  test.setTimeout(90_000);
  const pa = await makePlatformAdmin();
  const next = `e2e-admin-new-${Date.now()}@example.invalid`;
  try {
    await signIn(page, pa.email, PASSWORD);
    await page.goto(`${ADMIN}/admin/settings/security`);
    const form = page.locator("form", { hasText: "Sign-in email" });
    await form.getByLabel("New email").fill(next);
    await form.getByLabel("Current password").fill("not-it-at-all");
    await form.getByRole("button", { name: "Send Confirmation Link" }).click();
    await expect(form.locator(".autherr")).toHaveText("Your current password isn't right");
    await form.getByLabel("Current password").fill(PASSWORD);
    await form.getByRole("button", { name: "Send Confirmation Link" }).click();
    await expect(form.getByText(`Check ${next} for the link`)).toBeVisible();
    // Nothing has changed yet.
    expect((await admin.auth.admin.getUserById(pa.id)).data.user!.email).toBe(pa.email);

    // A link made for someone else does nothing here.
    await page.goto(`${ADMIN}/admin/confirm-email?token=${encodeURIComponent(makeEmailChangeToken(crypto.randomUUID(), next))}`);
    await expect(page.locator(".autherr")).toContainText("isn't for this account");
    // The email went to a .invalid address, so the same link is made here.
    await page.goto(`${ADMIN}/admin/confirm-email?token=${encodeURIComponent(makeEmailChangeToken(pa.id, next))}`);
    await expect(page.getByText(`you now sign in to Frank Admin as ${next}`)).toBeVisible();
    expect((await admin.auth.admin.getUserById(pa.id)).data.user!.email).toBe(next);
    expect((await admin.from("users").select("email").eq("id", pa.id).single()).data!.email).toBe(next);
    expect((await anon().auth.signInWithPassword({ email: next, password: PASSWORD })).error).toBeNull();
  } finally {
    await pa.cleanup();
  }
});

test("signing out everywhere else ends the other sessions, not this one", async ({ page }) => {
  const pa = await makePlatformAdmin();
  try {
    const elsewhere = anon();
    await elsewhere.auth.signInWithPassword({ email: pa.email, password: PASSWORD });
    await signIn(page, pa.email, PASSWORD);
    await page.goto(`${ADMIN}/admin/settings/security`);
    await page.getByRole("button", { name: "Sign Out Everywhere Else" }).click();
    await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
    // The other session can't renew itself; this one still works.
    expect((await elsewhere.auth.refreshSession()).error).not.toBeNull();
    await page.goto(`${ADMIN}/admin/settings/notifications`);
    await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  } finally {
    await pa.cleanup();
  }
});
