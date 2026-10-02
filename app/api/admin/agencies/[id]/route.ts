import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin/require-platform-admin";

// The plan_tier values (phase0).
const PLANS = ["free", "starter", "growth", "agency", "enterprise"];

// An agency's limits and suspension (phase37).
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth) return auth.error;
  const { admin } = auth;
  const { id } = await ctx.params;

  let body: {
    plan?: string;
    seat_limit?: number;
    client_limit?: number;
    ai_monthly_request_cap?: number;
    suspended?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (body.plan !== undefined) {
    if (!PLANS.includes(body.plan)) return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
    update.plan = body.plan;
  }
  for (const key of ["seat_limit", "client_limit", "ai_monthly_request_cap"] as const) {
    if (body[key] !== undefined) {
      const n = Number(body[key]);
      if (!Number.isInteger(n) || n < 0) return NextResponse.json({ error: "Limits are whole numbers, 0 or more." }, { status: 400 });
      update[key] = n;
    }
  }
  if (body.suspended !== undefined) update.suspended_at = body.suspended ? new Date().toISOString() : null;
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });

  const { data, error } = await admin.from("agencies").update(update).eq("id", id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Agency not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
