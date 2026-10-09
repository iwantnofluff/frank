import type { SupabaseClient, User } from "@supabase/supabase-js";

// The admin area acting inside an agency (phase51): every action gives a
// reason and is recorded in admin_actions, which the agency's Owners can
// read. Writes go through the service role, after requirePlatformAdmin().

export function reasonFrom(body: { reason?: unknown }): string | null {
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  return reason.length >= 1 && reason.length <= 500 ? reason : null;
}

export const REASON_REQUIRED = "Give a reason (up to 500 characters). The workspace's Owners will see it.";

export async function logAction(
  admin: SupabaseClient,
  actor: User,
  entry: { agencyId: string; action: string; target?: string | null; detail?: string | null; reason: string },
) {
  const { data: me } = await admin.from("users").select("name").eq("id", actor.id).maybeSingle();
  const { error } = await admin.from("admin_actions").insert({
    agency_id: entry.agencyId,
    actor_id: actor.id,
    actor_name: (me?.name as string | undefined) || actor.email || "Frank admin",
    action: entry.action,
    target: entry.target ?? null,
    detail: entry.detail ?? null,
    reason: entry.reason,
  });
  // Acting without a record isn't allowed: the caller reports this.
  if (error) throw new Error(`The action was done, but couldn't be logged: ${error.message}`);
}
