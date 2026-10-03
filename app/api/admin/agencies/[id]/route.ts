import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin/require-platform-admin";

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
