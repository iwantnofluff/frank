import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { emailPlatformAdmins } from "@/lib/admin/email-platform-admins";
import { PLAN_ORDER, planById } from "@/lib/plans";

// An agency's Admin or Owner asks to change plan (phase38). Until payments
// are connected (decided: Paddle), this records the request — as the
// signed-in person, so plan_requests' own rule decides who may — and emails
// the platform admins, who apply it from the admin area.
export async function POST(request: Request) {
  let body: { agencyId?: string; plan?: string; interval?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const tier = planById(body.plan);
  const interval = body.interval === "annual" ? "annual" : "monthly";
  if (!body.agencyId || !tier || !PLAN_ORDER.includes(tier.id)) {
    return NextResponse.json({ error: "Choose a plan" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: row, error } = await supabase
    .from("plan_requests")
    .insert({ agency_id: body.agencyId, requested_plan: tier.id, billing_interval: interval, requested_by: user.id })
    .select("id")
    .maybeSingle();
  // A blocked insert (not an Admin or Owner) comes back as an RLS error.
  if (error && error.code !== "42501") return NextResponse.json({ error: error.message }, { status: 500 });
  if (error || !row) return NextResponse.json({ error: "Only Admins and Owners can change the plan." }, { status: 403 });

  // Tell the platform admins (best effort — the request is recorded either way).
  const admin = createServiceRoleClient();
  const [{ data: agency }, { data: who }] = await Promise.all([
    admin.from("agencies").select("name, plan").eq("id", body.agencyId).single(),
    admin.from("users").select("name, email").eq("id", user.id).single(),
  ]);
  const from = planById(agency?.plan)?.name ?? agency?.plan ?? "their plan";
  await emailPlatformAdmins(
    admin,
    `${agency?.name ?? "An agency"} asked to move to ${tier.name}`,
    `${who?.name ?? who?.email} at ${agency?.name} asked to move from ${from} to ${tier.name}, billed ${interval}.\n\nApply or decline it in Frank Admin.`,
  );
  return NextResponse.json({ id: row.id }, { status: 201 });
}
