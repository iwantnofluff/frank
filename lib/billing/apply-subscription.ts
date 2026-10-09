import type { SupabaseClient } from "@supabase/supabase-js";
import { planForPrice } from "./prices";
import { nextBillingState, type BillingRow, type PaddleSubscription } from "./rules";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ApplyResult =
  | { outcome: "applied"; agencyId: string; plan: string; planChanged: boolean; previousPlan: string }
  | { outcome: "stale" | "ignored"; agencyId: string | null }
  // A second subscription for an agency that's already paying: not taken
  // over, so the first one's state stands. Frank sorts it out.
  | { outcome: "conflict"; agencyId: string };

// Brings Frank in line with one Paddle subscription (phase39): the webhook
// with each notification, and the billing routes with what Paddle answers
// a change with. Service role only. `eventAt` is the notification's time;
// a route passes null, and never moves last_event_at.
export async function applySubscription(
  admin: SupabaseClient,
  sub: PaddleSubscription,
  eventAt: string | null,
): Promise<ApplyResult> {
  // Which agency: the one Frank's checkout named, else whoever has it. Only
  // then does anything else matter: an event for no agency of this site's
  // (Paddle's own test events; staging's, arriving here, or the other way
  // round) is set aside rather than failed, or Paddle would keep retrying it.
  const named = sub.custom_data?.agency_id;
  let agencyId = typeof named === "string" && UUID.test(named) ? named : null;
  if (!agencyId) {
    const { data } = await admin
      .from("agency_billing")
      .select("agency_id")
      .eq("paddle_subscription_id", sub.id)
      .maybeSingle();
    agencyId = data?.agency_id ?? null;
  }
  if (!agencyId) return { outcome: "ignored", agencyId: null };

  const [{ data: agency, error: agencyError }, { data: prevRow, error: prevError }] = await Promise.all([
    admin.from("agencies").select("plan").eq("id", agencyId).maybeSingle(),
    admin.from("agency_billing").select("*").eq("agency_id", agencyId).maybeSingle(),
  ]);
  if (agencyError) throw agencyError;
  if (prevError) throw prevError;
  if (!agency) return { outcome: "ignored", agencyId: null };
  const prev = prevRow as BillingRow | null;

  const subscribed = planForPrice(sub.items[0]?.price.id ?? "");
  if (!subscribed) throw new Error(`Paddle subscription ${sub.id} is on a price Frank doesn't know`);

  if (prev?.paddle_subscription_id && prev.paddle_subscription_id !== sub.id) {
    // An older subscription ending doesn't touch the newer one.
    if (sub.status === "canceled") return { outcome: "ignored", agencyId };
    if (prev.status !== "canceled") return { outcome: "conflict", agencyId };
  }
  if (eventAt && prev?.last_event_at && new Date(eventAt) < new Date(prev.last_event_at)) {
    return { outcome: "stale", agencyId };
  }

  const next = nextBillingState(sub, subscribed, prev, agency.plan);
  const row = {
    agency_id: agencyId,
    ...next.row,
    last_event_at: eventAt ?? prev?.last_event_at ?? null,
    updated_at: new Date().toISOString(),
  };
  const { error: upsertError } = await admin.from("agency_billing").upsert(row, { onConflict: "agency_id" });
  if (upsertError) throw upsertError;

  const planChanged = next.plan !== agency.plan;
  if (planChanged) {
    // The database applies the plan's limits, plus any admin override
    // (apply_plan_limits, phase42).
    const { data: updated, error } = await admin
      .from("agencies")
      .update({ plan: next.plan })
      .eq("id", agencyId)
      .select("id");
    if (error) throw error;
    if (!updated?.length) throw new Error(`Workspace ${agencyId} wasn't updated`);
  }
  return { outcome: "applied", agencyId, plan: next.plan, planChanged, previousPlan: agency.plan };
}
