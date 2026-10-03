import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin/require-platform-admin";
import { planById } from "@/lib/plans";

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
    seat_limit?: number | null; // null: unlimited
    client_limit?: number | null;
    ai_monthly_request_cap?: number;
    suspended?: boolean;
    // Its address (decided directly: changed by Frank, from here).
    subdomain?: string;
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
    // A new plan brings its own limits (lib/plans.ts), unless given here.
    const tier = planById(body.plan)!;
    if (body.seat_limit === undefined) update.seat_limit = tier.seats;
    if (body.client_limit === undefined) update.client_limit = tier.clients;
  }
  for (const key of ["seat_limit", "client_limit", "ai_monthly_request_cap"] as const) {
    if (body[key] === null && key !== "ai_monthly_request_cap") {
      update[key] = null;
    } else if (body[key] !== undefined) {
      const n = Number(body[key]);
      if (!Number.isInteger(n) || n < 0) return NextResponse.json({ error: "Limits are whole numbers, 0 or more." }, { status: 400 });
      update[key] = n;
    }
  }
  if (body.subdomain !== undefined) update.subdomain = body.subdomain.trim().toLowerCase();
  if (body.suspended !== undefined) update.suspended_at = body.suspended ? new Date().toISOString() : null;
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });

  const { data, error } = await admin.from("agencies").update(update).eq("id", id).select("id").maybeSingle();
  if (error) {
    const friendly = error.message.includes("agencies_subdomain_format")
      ? "That address isn't allowed: use 2–32 lower-case letters, numbers or hyphens, and not a reserved name like www or admin."
      : error.message.includes("duplicate") || error.message.includes("unique")
        ? "Another agency already has that address."
        : error.message;
    return NextResponse.json({ error: friendly }, { status: error.message.includes("agencies_") || error.message.includes("unique") ? 400 : 500 });
  }
  if (!data) return NextResponse.json({ error: "Agency not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
