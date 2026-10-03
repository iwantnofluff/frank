// Run with: node --experimental-strip-types --test lib/billing/rules.test.ts
// (or `npm run test:unit`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyChange, nextBillingState, type BillingRow, type PaddleSubscription } from "./rules.ts";
import { planForPrice, priceFor } from "./prices.ts";

test("classifyChange: dearer is an upgrade, cheaper waits, yearly to monthly goes to Frank", () => {
  const m = "monthly" as const;
  const y = "annual" as const;
  assert.equal(classifyChange({ plan: "starter", interval: m }, { plan: "starter", interval: m }).kind, "same");
  assert.equal(classifyChange({ plan: "starter", interval: m }, { plan: "growth", interval: m }).kind, "upgrade");
  assert.equal(classifyChange({ plan: "growth", interval: y }, { plan: "agency", interval: y }).kind, "upgrade");
  assert.equal(classifyChange({ plan: "growth", interval: m }, { plan: "starter", interval: m }).kind, "downgrade");
  assert.equal(classifyChange({ plan: "agency", interval: y }, { plan: "growth", interval: y }).kind, "downgrade");
  assert.equal(classifyChange({ plan: "growth", interval: m }, { plan: "growth", interval: y }).kind, "upgrade");
  assert.equal(classifyChange({ plan: "growth", interval: m }, { plan: "starter", interval: y }).kind, "upgrade");
  assert.equal(classifyChange({ plan: "growth", interval: y }, { plan: "growth", interval: m }).kind, "ask");
  assert.equal(classifyChange({ plan: "starter", interval: y }, { plan: "agency", interval: m }).kind, "ask");
});

test("prices: every sandbox price maps back to its plan and interval", () => {
  for (const plan of ["starter", "growth", "agency"] as const) {
    for (const interval of ["monthly", "annual"] as const) {
      const id = priceFor(plan, interval, "sandbox");
      assert.ok(id?.startsWith("pri_"));
      assert.deepEqual(planForPrice(id!, "sandbox"), { plan, interval });
    }
  }
  assert.equal(planForPrice("pri_unknown", "sandbox"), null);
  assert.equal(priceFor("free", "monthly", "sandbox"), null);
});

const sub = (over: Partial<PaddleSubscription> = {}): PaddleSubscription => ({
  id: "sub_1",
  status: "active",
  customer_id: "ctm_1",
  items: [{ price: { id: "pri_x" } }],
  current_billing_period: { starts_at: "2026-10-03T10:00:00Z", ends_at: "2026-11-03T10:00:00Z" },
  scheduled_change: null,
  custom_data: { agency_id: "a1" },
  ...over,
});
const row = (over: Partial<BillingRow> = {}): BillingRow => ({
  agency_id: "a1",
  paddle_customer_id: "ctm_1",
  paddle_subscription_id: "sub_1",
  status: "active",
  billing_interval: "monthly",
  period_starts_at: "2026-10-03T10:00:00.000Z",
  period_ends_at: "2026-11-03T10:00:00.000Z",
  scheduled_plan: null,
  cancel_at: null,
  last_event_at: null,
  ...over,
});

test("nextBillingState: a first payment moves the plan", () => {
  const n = nextBillingState(sub(), { plan: "growth", interval: "monthly" }, null, "free");
  assert.equal(n.plan, "growth");
  assert.equal(n.row.scheduled_plan, null);
  assert.equal(n.row.billing_interval, "monthly");
  assert.equal(n.row.period_ends_at, "2026-11-03T10:00:00Z");
});

test("nextBillingState: an upgrade starts now", () => {
  const n = nextBillingState(sub(), { plan: "agency", interval: "monthly" }, row(), "growth");
  assert.equal(n.plan, "agency");
  assert.equal(n.row.scheduled_plan, null);
});

test("nextBillingState: a downgrade keeps the plan paid for until the period ends, then applies", () => {
  // Same period (Postgres writes the instant back in its own format).
  const during = nextBillingState(sub(), { plan: "starter", interval: "monthly" }, row(), "growth");
  assert.equal(during.plan, "growth");
  assert.equal(during.row.scheduled_plan, "starter");
  assert.equal(during.row.billing_interval, "monthly");
  // Renewal: a new period, so the cheaper plan is what's paid for now.
  const renewed = nextBillingState(
    sub({ current_billing_period: { starts_at: "2026-11-03T10:00:00Z", ends_at: "2026-12-03T10:00:00Z" } }),
    { plan: "starter", interval: "monthly" },
    row({ scheduled_plan: "starter" }),
    "growth",
  );
  assert.equal(renewed.plan, "starter");
  assert.equal(renewed.row.scheduled_plan, null);
});

test("nextBillingState: undoing a downgrade clears it", () => {
  const n = nextBillingState(sub(), { plan: "growth", interval: "monthly" }, row({ scheduled_plan: "starter" }), "growth");
  assert.equal(n.plan, "growth");
  assert.equal(n.row.scheduled_plan, null);
});

test("nextBillingState: cancelling waits for the period end, then drops to Free", () => {
  const scheduled = nextBillingState(
    sub({ scheduled_change: { action: "cancel", effective_at: "2026-11-03T10:00:00Z" } }),
    { plan: "growth", interval: "monthly" },
    row(),
    "growth",
  );
  assert.equal(scheduled.plan, "growth");
  assert.equal(scheduled.row.cancel_at, "2026-11-03T10:00:00Z");
  const ended = nextBillingState(sub({ status: "canceled" }), { plan: "growth", interval: "monthly" }, row(), "growth");
  assert.equal(ended.plan, "free");
  assert.equal(ended.row.status, "canceled");
  assert.equal(ended.row.period_ends_at, null);
});

test("nextBillingState: a different subscription isn't treated as the same period", () => {
  const n = nextBillingState(sub({ id: "sub_2" }), { plan: "starter", interval: "monthly" }, row(), "growth");
  assert.equal(n.plan, "starter");
});
