import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import { test, expect, APP_URL, type Frank } from "./fixtures";

// Paying through Paddle (phase39). Paddle itself is never called here: the
// webhook gets notifications signed with the real secret, the way Paddle
// signs them, and the pages are seeded with the billing state a payment
// leaves. The real sandbox checkout is checked by hand.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const SECRET = process.env.PADDLE_WEBHOOK_SECRET!;
const PRICE = {
  growthMonthly: "pri_01m4029436mvsghxnh6ytbea0m",
  starterMonthly: "pri_01m4026egrq97tg3tgn2mxmfh2",
};
const OCT = { starts_at: "2026-10-03T10:00:00Z", ends_at: "2026-11-03T10:00:00Z" };
const NOV = { starts_at: "2026-11-03T10:00:00Z", ends_at: "2026-12-03T10:00:00Z" };

const card = (page: Page, name: string) =>
  page.locator(".plancard", { has: page.locator(".plancard-h b", { hasText: new RegExp(`^${name}$`) }) });

let n = 0;
async function notify(
  frank: Frank,
  type: string,
  sub: { price: string; status?: string; period?: typeof OCT; cancelAt?: string },
  opts: { eventId?: string; at?: string; signature?: string } = {},
) {
  const body = JSON.stringify({
    event_id: opts.eventId ?? `evt_e2e_${Date.now()}_${n++}`,
    event_type: type,
    occurred_at: opts.at ?? new Date().toISOString(),
    data: {
      id: `sub_e2e_${frank.agencyId}`,
      status: sub.status ?? "active",
      customer_id: "ctm_e2e",
      items: [{ price: { id: sub.price } }],
      current_billing_period: sub.status === "canceled" ? null : (sub.period ?? OCT),
      scheduled_change: sub.cancelAt ? { action: "cancel", effective_at: sub.cancelAt } : null,
      custom_data: { agency_id: frank.agencyId },
    },
  });
  const ts = Math.floor(Date.now() / 1000);
  const signature = opts.signature ?? `ts=${ts};h1=${createHmac("sha256", SECRET).update(`${ts}:${body}`).digest("hex")}`;
  return fetch(`${APP_URL}/api/billing/paddle-webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Paddle-Signature": signature },
    body,
  });
}

const agencyNow = async (frank: Frank) =>
  (await admin.from("agencies").select("plan, client_limit, seat_limit").eq("id", frank.agencyId).single()).data;
const billingNow = async (frank: Frank) =>
  (await admin.from("agency_billing").select("*").eq("agency_id", frank.agencyId).maybeSingle()).data;

test.afterEach(async ({ frank }) => {
  await admin.from("paddle_events").delete().like("event_id", "evt_e2e_%");
  await admin.from("agency_billing").delete().eq("agency_id", frank.agencyId);
});

test("the webhook: paying, a downgrade waiting for renewal, and cancelling", async ({ frank }) => {
  test.setTimeout(60_000);
  // No override, so the plan's own limits show (phase42 works them out).
  await admin.from("agencies").update({ plan: "free", extra_clients: 0, extra_seats: 0 }).eq("id", frank.agencyId);

  // Not signed by Paddle: refused, nothing changes.
  const forged = await notify(frank, "subscription.created", { price: PRICE.growthMonthly }, { signature: "ts=1;h1=00" });
  expect(forged.status).toBe(401);
  expect((await agencyNow(frank))!.plan).toBe("free");

  // Paid for Growth: the plan and its limits move.
  const at = new Date().toISOString();
  const created = await notify(frank, "subscription.created", { price: PRICE.growthMonthly }, { eventId: "evt_e2e_first", at });
  expect(created.status).toBe(200);
  expect(await agencyNow(frank)).toEqual({ plan: "growth", client_limit: 10, seat_limit: 15 });
  expect(await billingNow(frank)).toMatchObject({ status: "active", billing_interval: "monthly", paddle_customer_id: "ctm_e2e" });

  // Paddle retries a notification it's not sure arrived: applied once (were
  // it applied again, it would put Growth back).
  await admin.from("agencies").update({ plan: "starter" }).eq("id", frank.agencyId);
  const again = await notify(frank, "subscription.created", { price: PRICE.growthMonthly }, { eventId: "evt_e2e_first", at });
  expect(await again.json()).toMatchObject({ duplicate: true });
  expect((await agencyNow(frank))!.plan).toBe("starter");
  await admin.from("agencies").update({ plan: "growth" }).eq("id", frank.agencyId);

  // Moved to Starter during October: Growth stays until the period ends.
  await notify(frank, "subscription.updated", { price: PRICE.starterMonthly });
  expect((await agencyNow(frank))!.plan).toBe("growth");
  expect((await billingNow(frank))!.scheduled_plan).toBe("starter");

  // A late notification from before that can't undo it.
  await notify(frank, "subscription.updated", { price: PRICE.growthMonthly }, { at: "2026-01-01T00:00:00Z" });
  expect((await billingNow(frank))!.scheduled_plan).toBe("starter");

  // Renewed in November: Starter, with its limits.
  await notify(frank, "subscription.updated", { price: PRICE.starterMonthly, period: NOV });
  expect(await agencyNow(frank)).toEqual({ plan: "starter", client_limit: 3, seat_limit: 5 });
  expect((await billingNow(frank))!.scheduled_plan).toBeNull();

  // Cancelling waits for the period end, then drops to Free.
  await notify(frank, "subscription.updated", { price: PRICE.starterMonthly, period: NOV, cancelAt: NOV.ends_at });
  expect((await agencyNow(frank))!.plan).toBe("starter");
  expect(new Date((await billingNow(frank))!.cancel_at).toISOString()).toBe(new Date(NOV.ends_at).toISOString());
  await notify(frank, "subscription.canceled", { price: PRICE.starterMonthly, status: "canceled" });
  expect(await agencyNow(frank)).toEqual({ plan: "free", client_limit: 1, seat_limit: 2 });
  expect((await billingNow(frank))!.status).toBe("canceled");
});

async function seedPaying(frank: Frank, over: Record<string, unknown> = {}) {
  await admin.from("agencies").update({ plan: "growth" }).eq("id", frank.agencyId);
  const { error } = await admin.from("agency_billing").insert({
    agency_id: frank.agencyId,
    paddle_customer_id: "ctm_e2e",
    paddle_subscription_id: `sub_e2e_${frank.agencyId}`,
    status: "active",
    billing_interval: "monthly",
    period_starts_at: OCT.starts_at,
    period_ends_at: OCT.ends_at,
    ...over,
  });
  expect(error).toBeNull();
}

test("an agency on Free chooses a plan by card, in test mode", async ({ page, frank }) => {
  await admin.from("agencies").update({ plan: "free" }).eq("id", frank.agencyId);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/settings/plan/plans`);
  await expect(card(page, "Free").getByRole("button", { name: "Current plan" })).toBeDisabled();
  await expect(card(page, "Growth").getByRole("button", { name: "Choose Growth" })).toBeEnabled();
  await expect(page.getByText("Test mode: card 4242 4242 4242 4242")).toBeVisible();
  // Enterprise is still a conversation.
  await expect(card(page, "Enterprise").getByRole("button", { name: "Talk to us" })).toBeEnabled();
  // Nothing to pay yet, so nothing at Paddle to open.
  await page.goto(`${APP_URL}/settings/billing/invoices`);
  await expect(page.getByText(/is on Free, so there.s nothing to pay/)).toBeVisible();
});

test("paying through Paddle: renewal, a waiting downgrade, and the billing pages", async ({ page, frank }) => {
  await seedPaying(frank);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/settings/plan/plans`);
  await expect(page.locator(".srow", { hasText: "Renews" })).toContainText("Paid through Paddle, monthly");
  await expect(card(page, "Starter").getByRole("button", { name: "Choose Starter" })).toBeEnabled();
  await expect(card(page, "Free").getByRole("button", { name: "Choose Free" })).toBeEnabled();
  // Annual shows Growth's own card as a switch.
  await page.getByRole("button", { name: /^Annual/ }).click();
  await expect(card(page, "Growth").getByRole("button", { name: "Switch to Yearly" })).toBeEnabled();

  await page.goto(`${APP_URL}/settings/billing/overview`);
  await expect(page.locator(".srow", { hasText: "Next payment" })).toContainText("Charged to the card on file");
  await expect(page.locator(".srow", { hasText: "Billing details" }).getByRole("button", { name: "Open" })).toBeEnabled();

  // A downgrade waiting for the end of October.
  await admin.from("agency_billing").update({ scheduled_plan: "starter" }).eq("agency_id", frank.agencyId);
  await page.goto(`${APP_URL}/settings/plan/plans`);
  await expect(page.locator(".note")).toContainText("E2E Test Agency moves to Starter on");
  await expect(page.locator(".note").getByRole("button", { name: "Keep Growth" })).toBeVisible();
  await expect(card(page, "Agency").getByRole("button", { name: "Choose Agency" })).toBeDisabled();
});

test("a User can't see billing, and the billing routes refuse them", async ({ page, frank }) => {
  await seedPaying(frank);
  const staffId = (await admin.from("users").select("id").eq("email", frank.staffEmail).single()).data!.id;
  await admin.from("memberships").update({ role: "user" }).eq("agency_id", frank.agencyId).eq("user_id", staffId);
  await frank.loginAsStaff(page);
  await page.goto(`${APP_URL}/settings/billing/overview`);
  await expect(page.getByText("Only Admins and Owners can see billing.")).toBeVisible();
  for (const path of ["checkout", "change", "undo", "portal"]) {
    const res = await page.request.post(`${APP_URL}/api/billing/${path}`, {
      data: { agencyId: frank.agencyId, plan: "agency", interval: "monthly" },
    });
    expect(res.status(), path).toBe(403);
  }
});
