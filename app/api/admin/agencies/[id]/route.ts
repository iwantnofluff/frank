import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin/require-platform-admin";
import { deleteAgency } from "@/lib/admin/delete-agency";
import { paddle } from "@/lib/billing/paddle";
import { REASON_REQUIRED, logAction, reasonFrom } from "@/lib/admin/actions";

// The admin override's columns (phase42).
const EXTRAS = ["extra_seats", "extra_clients", "extra_ai_requests", "extra_storage_bytes"] as const;

// One agency, from the admin area (decided directly, phase42):
// - the admin override: extra members, clients, AI requests and storage on
//   top of the plan;
// - pausing it (phase37).
// Not its plan (the agency's to choose) or its address (its Owner's).
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth) return auth.error;
  const { admin, user } = auth;
  const { id } = await ctx.params;

  let body: Partial<Record<(typeof EXTRAS)[number], number>> & { plan?: string; suspended?: boolean; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  // The plan is the agency's to choose (decided directly, 3 Oct 2026), by
  // card or by asking Frank (applying a request is /api/admin/plan-requests).
  if (body.plan !== undefined) {
    return NextResponse.json({ error: "The plan is the agency's to choose." }, { status: 403 });
  }
  for (const key of EXTRAS) {
    if (body[key] === undefined) continue;
    const n = Number(body[key]);
    if (!Number.isInteger(n) || n < 0) return NextResponse.json({ error: "Extras are whole numbers, 0 or more." }, { status: 400 });
    update[key] = n;
  }
  // Pausing and unpausing are logged for the agency to see (phase51).
  const reason = reasonFrom(body);
  if (body.suspended !== undefined) {
    if (!reason) return NextResponse.json({ error: REASON_REQUIRED }, { status: 400 });
    update.suspended_at = body.suspended ? new Date().toISOString() : null;
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });

  const { data, error } = await admin.from("agencies").update(update).eq("id", id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Agency not found" }, { status: 404 });
  if (body.suspended !== undefined) {
    try {
      await logAction(admin, user, {
        agencyId: id,
        action: body.suspended ? "Paused the agency" : "Unpaused the agency",
        reason: reason!,
      });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }
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
