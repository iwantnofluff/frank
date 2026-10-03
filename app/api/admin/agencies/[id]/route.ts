import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin/require-platform-admin";
import { deleteAgency } from "@/lib/admin/delete-agency";
import { paddle } from "@/lib/billing/paddle";

// The plan_tier values (phase0).
const PLANS = ["free", "starter", "growth", "agency", "enterprise"];
const EXTRAS = ["extra_seats", "extra_clients", "extra_ai_requests", "extra_storage_bytes"] as const;

// One agency, from the admin area (decided directly, phase42):
// - its plan, only while it isn't paying by card (Paddle and its Owner own
//   that one); the database applies the plan's limits (apply_plan_limits);
// - the admin override: extra members, clients, AI requests and storage on
//   top of the plan;
// - pausing it (phase37).
// Not its address: that's the Owner's, in Settings → Account URL.
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth) return auth.error;
  const { admin } = auth;
  const { id } = await ctx.params;

  let body: Partial<Record<(typeof EXTRAS)[number], number>> & { plan?: string; suspended?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (body.plan !== undefined) {
    if (!PLANS.includes(body.plan)) return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
    const { data: billing } = await admin
      .from("agency_billing")
      .select("paddle_subscription_id, status")
      .eq("agency_id", id)
      .maybeSingle();
    if (billing?.paddle_subscription_id && billing.status !== "canceled") {
      return NextResponse.json(
        { error: "This agency pays by card, so its plan is its Owner's to change. Add to its limits with the override instead." },
        { status: 409 },
      );
    }
    update.plan = body.plan;
  }
  for (const key of EXTRAS) {
    if (body[key] === undefined) continue;
    const n = Number(body[key]);
    if (!Number.isInteger(n) || n < 0) return NextResponse.json({ error: "Extras are whole numbers, 0 or more." }, { status: 400 });
    update[key] = n;
  }
  if (body.suspended !== undefined) update.suspended_at = body.suspended ? new Date().toISOString() : null;
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });

  const { data, error } = await admin.from("agencies").update(update).eq("id", id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Agency not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

// Deleting an agency outright: staging only (decided directly), where
// ALLOW_AGENCY_DELETE is set, so the same agency and email can be signed up
// again while testing. Live keeps pausing as its only way to stop one.
export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (process.env.ALLOW_AGENCY_DELETE !== "true") {
    return NextResponse.json({ error: "Agencies can't be deleted here." }, { status: 403 });
  }
  const auth = await requirePlatformAdmin();
  if ("error" in auth) return auth.error;
  const { admin } = auth;
  const { id } = await ctx.params;

  // A Paddle (sandbox) subscription would otherwise keep renewing for an
  // agency that's gone.
  const { data: billing } = await admin
    .from("agency_billing")
    .select("paddle_subscription_id, status")
    .eq("agency_id", id)
    .maybeSingle();
  if (billing?.paddle_subscription_id && billing.status !== "canceled") {
    try {
      await paddle("POST", `/subscriptions/${billing.paddle_subscription_id}/cancel`, { effective_from: "immediately" });
    } catch {
      // Already cancelled at Paddle, or not found: nothing left to stop.
    }
  }
  try {
    const result = await deleteAgency(admin, id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
