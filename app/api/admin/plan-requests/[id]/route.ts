import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin/require-platform-admin";
import { planById } from "@/lib/plans";

// Applies or declines an agency's request to change plan (phase38).
// Applying moves the agency to that plan with its limits (lib/plans.ts).
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth) return auth.error;
  const { admin } = auth;
  const { id } = await ctx.params;

  let outcome: string | undefined;
  try {
    ({ outcome } = await request.json());
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (outcome !== "applied" && outcome !== "declined") {
    return NextResponse.json({ error: "outcome is applied or declined" }, { status: 400 });
  }

  const { data: req } = await admin
    .from("plan_requests")
    .select("id, agency_id, requested_plan, handled_at")
    .eq("id", id)
    .maybeSingle();
  if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (req.handled_at) return NextResponse.json({ error: "Already handled" }, { status: 409 });

  if (outcome === "applied") {
    const tier = planById(req.requested_plan)!;
    const { error } = await admin
      .from("agencies")
      .update({ plan: tier.id })
      .eq("id", req.agency_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const { error } = await admin
    .from("plan_requests")
    .update({ handled_at: new Date().toISOString(), outcome })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
