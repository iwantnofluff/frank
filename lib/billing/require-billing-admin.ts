import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { BillingRow } from "./rules";
import { formatBytes } from "@/lib/plans";

// Every billing route starts here (phase39): the signed-in person has to be
// an Admin or Owner of the agency (the spec: billing is managed by the
// agency Admin) — asked of the database as them, through is_agency_admin.
// Only then does the route read the agency and its billing as the service
// role, and talk to Paddle.
export async function requireBillingAdmin(agencyId: string | undefined) {
  if (!agencyId) return { error: NextResponse.json({ error: "Bad request" }, { status: 400 }) } as const;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) } as const;
  const { data: isAdmin, error } = await supabase.rpc("is_agency_admin", { check_agency_id: agencyId });
  if (error) return { error: NextResponse.json({ error: error.message }, { status: 500 }) } as const;
  if (!isAdmin) {
    return { error: NextResponse.json({ error: "Only Admins and Owners can change the plan." }, { status: 403 }) } as const;
  }
  const admin = createServiceRoleClient();
  const [{ data: agency }, { data: billing }] = await Promise.all([
    admin.from("agencies").select("id, name, plan").eq("id", agencyId).single(),
    admin.from("agency_billing").select("*").eq("agency_id", agencyId).maybeSingle(),
  ]);
  if (!agency) return { error: NextResponse.json({ error: "No such agency" }, { status: 404 }) } as const;
  return { admin, user, agency, billing: billing as BillingRow | null } as const;
}

// Paying through Paddle now: a live subscription.
export const hasLiveSubscription = (b: BillingRow | null) => !!b?.paddle_subscription_id && b.status !== "canceled";


// Would the agency fit the plan's limits? A downgrade or cancellation that
// wouldn't is refused, saying what to change first (decided directly).
export async function overLimits(
  admin: ReturnType<typeof createServiceRoleClient>,
  agencyId: string,
  limits: { clients: number | null; seats: number | null; storageBytes: number | null; name: string },
): Promise<string | null> {
  const [{ count: clients }, { count: seats }, { data: stored }] = await Promise.all([
    admin.from("clients").select("id", { count: "exact", head: true }).eq("agency_id", agencyId).is("archived_at", null),
    admin
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("agency_id", agencyId)
      .is("client_id", null)
      .is("removed_at", null),
    admin.rpc("agency_storage_used", { check_agency_id: agencyId }),
  ]);
  const problems: string[] = [];
  if (limits.clients !== null && (clients ?? 0) > limits.clients) {
    problems.push(`archive ${(clients ?? 0) - limits.clients} of your ${clients} active clients`);
  }
  if (limits.seats !== null && (seats ?? 0) > limits.seats) {
    problems.push(`remove ${(seats ?? 0) - limits.seats} of your ${seats} team members (invites count)`);
  }
  const used = typeof stored === "number" ? stored : 0;
  if (limits.storageBytes !== null && used > limits.storageBytes) {
    problems.push(`delete ${formatBytes(used - limits.storageBytes)} of your ${formatBytes(used)} of files`);
  }
  if (!problems.length) return null;
  return `${limits.name} allows ${limits.clients ?? "unlimited"} active clients, ${limits.seats ?? "unlimited"} team members and ${formatBytes(limits.storageBytes)} of storage. First ${problems.join(", and ")}.`;
}
