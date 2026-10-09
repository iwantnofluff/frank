import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin/require-platform-admin";
import { REASON_REQUIRED, logAction, reasonFrom } from "@/lib/admin/actions";
import { INVITABLE_ROLES, ROLE_LABELS, type AgencyRole, type InvitableRole } from "@/lib/roles";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

// The admin fixes someone's role when an agency is stuck (phase51): Owner,
// Admin or User, for anyone on the team except the Primary Owner (that's a
// transfer of ownership, the agency's own). Logged.
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth) return auth.error;
  const { admin, user } = auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const reason = reasonFrom(body);
  if (!reason) return fail(REASON_REQUIRED, 400);
  const role = body.role as InvitableRole;
  if (!INVITABLE_ROLES.includes(role)) return fail("Choose Owner, Admin or User", 400);

  const { data: m } = await admin
    .from("memberships")
    .select("id, agency_id, role, client_id, user:users!memberships_user_id_fkey(email, name)")
    .eq("id", id)
    .maybeSingle();
  const member = m as unknown as {
    id: string;
    agency_id: string;
    role: AgencyRole;
    client_id: string | null;
    user: { email: string; name: string } | null;
  } | null;
  if (!member) return fail("Not found", 404);
  if (member.client_id) return fail("A Client's type is changed by the workspace, in its Client Profile", 409);
  if (member.role === "primary_owner") return fail("The Primary Owner's role changes only by transferring ownership", 409);
  if (member.role === role) return fail(`They're already ${ROLE_LABELS[role]}`, 409);

  const { error } = await admin
    .from("memberships")
    .update({ role, can_invite: false })
    .eq("id", member.id);
  if (error) return fail(error.message, 500);
  // Owners and Admins see every client: their grants and projects would
  // only be stale rows.
  if (role !== "user") {
    await admin.from("staff_client_access").delete().eq("membership_id", member.id);
    await admin.from("project_access").delete().eq("membership_id", member.id);
  }

  try {
    await logAction(admin, user, {
      agencyId: member.agency_id,
      action: "Changed a role",
      target: `${member.user?.name || member.user?.email} (${member.user?.email})`,
      detail: `${ROLE_LABELS[member.role]} → ${ROLE_LABELS[role]}${role === "user" ? ". They have no clients until the workspace gives them some." : ""}`,
      reason,
    });
  } catch (e) {
    return fail((e as Error).message, 500);
  }
  return NextResponse.json({ ok: true });
}
