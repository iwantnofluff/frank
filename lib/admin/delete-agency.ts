import type { SupabaseClient } from "@supabase/supabase-js";

// Deletes an agency and everything in it, for staging (decided directly,
// 3 Oct 2026: so the same agency and email can be signed up again while
// testing). The route only allows it where ALLOW_AGENCY_DELETE is set,
// which is the staging branch alone. Service role.
//
// Rows go in foreign-key order (the same sweep as the e2e fixture's
// teardown), then its files, then the accounts of people who belonged to
// it and to nothing else, so their emails are free again. Platform admins'
// accounts are never deleted.

export interface DeleteAgencyResult {
  rows: Record<string, number>;
  files: number;
  accounts: string[];
}

const TABLES = [
  "shared_links",
  "comments",
  "copy_versions",
  "creative_version_slides",
  "creative_versions",
  "creatives",
  "custom_columns",
  "projects",
  "format_directions",
  "agency_knowledge_entries",
  "knowledge_entries",
  "invites",
  "staff_client_access",
  "plan_requests",
  "agency_billing",
  "memberships",
  "calendar_views",
  "client_contacts",
  "project_folders",
  "clients",
  "agency_settings",
];

async function listFiles(admin: SupabaseClient, prefix: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from("assets").list(prefix, { limit: 1000, offset });
    if (error) throw error;
    for (const item of data ?? []) {
      const path = `${prefix}/${item.name}`;
      // A folder has no id.
      if (item.id) out.push(path);
      else out.push(...(await listFiles(admin, path)));
    }
    if (!data || data.length < 1000) return out;
  }
}

export async function deleteAgency(admin: SupabaseClient, agencyId: string): Promise<DeleteAgencyResult> {
  const { data: members, error: membersError } = await admin
    .from("memberships")
    .select("user_id")
    .eq("agency_id", agencyId);
  if (membersError) throw membersError;
  const userIds = [...new Set((members ?? []).map((m) => m.user_id as string))];

  const rows: Record<string, number> = {};
  for (const table of TABLES) {
    const { data, error } = await admin.from(table).delete().eq("agency_id", agencyId).select("agency_id");
    if (error) throw new Error(`${table}: ${error.message}`);
    rows[table] = data?.length ?? 0;
  }
  // Profile photos point at assets; unlink them before the assets go.
  const { data: owned } = await admin.from("assets").select("id").eq("agency_id", agencyId);
  const assetIds = (owned ?? []).map((a) => a.id as string);
  if (assetIds.length) await admin.from("users").update({ avatar_asset_id: null }).in("avatar_asset_id", assetIds);
  const { data: assets, error: assetsError } = await admin.from("assets").delete().eq("agency_id", agencyId).select("id");
  if (assetsError) throw new Error(`assets: ${assetsError.message}`);
  rows.assets = assets?.length ?? 0;
  const { data: usage } = await admin.from("ai_usage_events").delete().eq("agency_id", agencyId).select("agency_id");
  rows.ai_usage_events = usage?.length ?? 0;

  const files = await listFiles(admin, agencyId);
  for (let i = 0; i < files.length; i += 100) {
    const { error } = await admin.storage.from("assets").remove(files.slice(i, i + 100));
    if (error) throw new Error(`files: ${error.message}`);
  }

  const { data: gone, error: agencyError } = await admin.from("agencies").delete().eq("id", agencyId).select("id");
  if (agencyError) throw new Error(`agencies: ${agencyError.message}`);
  if (!gone?.length) throw new Error("The agency wasn't deleted");

  // Their accounts, unless they're in another agency or a platform admin.
  const accounts: string[] = [];
  for (const id of userIds) {
    const [{ data: elsewhere }, { data: platform }, { data: user }] = await Promise.all([
      admin.from("memberships").select("id").eq("user_id", id).limit(1),
      admin.from("platform_admins").select("user_id").eq("user_id", id).maybeSingle(),
      admin.from("users").select("email").eq("id", id).maybeSingle(),
    ]);
    if (elsewhere?.length || platform) continue;
    const { error } = await admin.from("users").delete().eq("id", id);
    if (error) throw new Error(`users: ${error.message}`);
    await admin.auth.admin.deleteUser(id);
    accounts.push(user?.email ?? id);
  }
  return { rows, files: files.length, accounts };
}
