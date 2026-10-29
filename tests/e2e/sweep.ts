import { createClient } from "@supabase/supabase-js";
import path from "path";

// The service-role client the e2e suite seeds and cleans up with, and the
// sweep that removes one test workspace and everything in it. Shared by
// the fixture's teardown (fixtures.ts) and the start of every run
// (global-setup.ts), so both remove things in the same order.

// Playwright's runner doesn't load .env.local the way `next dev` does.
process.loadEnvFile(path.resolve(__dirname, "../../.env.local"));

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Every test workspace has this name, so a sweep can never reach a real one.
export const TEST_AGENCY_NAME = "E2E Test Agency";

// Removes a test workspace and everything in it: one call to
// e2e_sweep_agency (supabase/test-support/, staging only), which does
// every delete below in a single round trip, then the workspace's files.
// Where that function isn't there, step by step as before. People's rows
// and accounts are the caller's to remove.
export async function sweepAgency(agencyId: string): Promise<void> {
  // Retried: a comment posted near a test's end fires a background
  // classify-comment call, and its ai_usage_events row can land after the
  // deletes and block the workspace's own on the foreign key.
  let result = await admin.rpc("e2e_sweep_agency", { p_agency_id: agencyId });
  for (let attempt = 0; result.error?.code === "23503" && attempt < 10; attempt++) {
    await new Promise((r) => setTimeout(r, 1000));
    result = await admin.rpc("e2e_sweep_agency", { p_agency_id: agencyId });
  }
  if (result.error?.code === "PGRST202") return sweepStepByStep(agencyId);
  if (result.error) {
    console.error("Cleanup failed at e2e_sweep_agency:", result.error);
    return sweepStepByStep(agencyId);
  }
  const { error } = await removeFiles(agencyId);
  if (error) console.error("Cleanup failed at storage files:", error);
}

// The files themselves (direct instruction: no test uploads left behind in
// storage). Everything under the agency's folder, any depth.
async function removeFiles(agencyId: string): Promise<{ error: unknown }> {
  const files: string[] = [];
  const walk = async (prefix: string) => {
    const { data, error } = await admin.storage.from("assets").list(prefix, { limit: 1000 });
    if (error) throw error;
    for (const f of data ?? []) {
      if (f.id === null) await walk(`${prefix}/${f.name}`);
      else files.push(`${prefix}/${f.name}`);
    }
  };
  try {
    await walk(agencyId);
  } catch (error) {
    return { error };
  }
  for (let i = 0; i < files.length; i += 100) {
    const { error } = await admin.storage.from("assets").remove(files.slice(i, i + 100));
    if (error) return { error };
  }
  return { error: null };
}

// The same, a delete at a time, reverse dependency order.
// Best-effort: each failure is logged, not thrown, so one doesn't stop the
// rest. By agency_id throughout, not by the ids a test created: every
// agency-scoped table has that column (denormalised for RLS), and specs
// are free to create their own extra rows; agency_id sweeps all of it.
// People's rows and accounts are the caller's to remove.
async function sweepStepByStep(agencyId: string): Promise<void> {
  const steps: [string, () => PromiseLike<{ error: unknown }>][] = [
    // By agency_id, not by the tokens tracked in sharedLinkTokens — that
    // array only sees links made via frank.createSharedLink(); one made
    // through the real ShareModal UI (share-eligibility.spec.ts) goes
    // through create_shared_link() instead and was never tracked,
    // which is exactly the gap that orphaned an agency here once already.
    ["shared_links", () => admin.from("shared_links").delete().eq("agency_id", agencyId)],
    // phase60: notifications about its posts (cascade with them anyway).
    ["notifications", () => admin.from("notifications").delete().eq("agency_id", agencyId)],
    // phase84: a project's Discussion (before users: its author has no
    // cascade) and its log.
    ["project_discussion", () => admin.from("project_discussion").delete().eq("agency_id", agencyId)],
    ["project_activity", () => admin.from("project_activity").delete().eq("agency_id", agencyId)],
    ["comments", () => admin.from("comments").delete().eq("agency_id", agencyId)],
    ["copy_versions", () => admin.from("copy_versions").delete().eq("agency_id", agencyId)],
    ["creative_version_slides", () => admin.from("creative_version_slides").delete().eq("agency_id", agencyId)],
    ["creative_versions", () => admin.from("creative_versions").delete().eq("agency_id", agencyId)],
    // phase118: a video's thumbnails (before assets).
    ["thumbnail_versions", () => admin.from("thumbnail_versions").delete().eq("agency_id", agencyId)],
    // phase52: Claude conversations about a post's copy (cascade with it,
    // swept by name so a failure says so).
    ["designer_notes", () => admin.from("designer_notes").delete().eq("agency_id", agencyId)],
    // phase121: proofreads of saved versions.
    ["proofreads", () => admin.from("proofreads").delete().eq("agency_id", agencyId)],
    // phase120: the Production tab's versions.
    ["production_versions", () => admin.from("production_versions").delete().eq("agency_id", agencyId)],
    // phase117: the notes' versions.
    ["designer_note_versions", () => admin.from("designer_note_versions").delete().eq("agency_id", agencyId)],
    ["reference_images", () => admin.from("reference_images").delete().eq("agency_id", agencyId)],
    ["design_directions", () => admin.from("design_directions").delete().eq("agency_id", agencyId)],
    ["copy_chat_messages", () => admin.from("copy_chat_messages").delete().eq("agency_id", agencyId)],
    ["copy_chats", () => admin.from("copy_chats").delete().eq("agency_id", agencyId)],
    // The stage log (phase71) goes with its posts; said here before them.
    ["creative_stage_events", () => admin.from("creative_stage_events").delete().eq("agency_id", agencyId)],
    ["post_live_dates", () => admin.from("post_live_dates").delete().eq("agency_id", agencyId)],
    // phase126: a post's final asset link (goes with it anyway).
    ["creative_asset_links", () => admin.from("creative_asset_links").delete().eq("agency_id", agencyId)],
    ["creatives", () => admin.from("creatives").delete().eq("agency_id", agencyId)],
    ["custom_columns", () => admin.from("custom_columns").delete().eq("agency_id", agencyId)],
    // References projects and memberships (phase46). Both cascade to it,
    // but swept by name so a failure here says so.
    ["project_access", () => admin.from("project_access").delete().eq("agency_id", agencyId)],
    ["projects", () => admin.from("projects").delete().eq("agency_id", agencyId)],
    // No RLS delete policy exists for format_directions at all — even
    // staff can't remove one through the app — so a spec that adds one
    // (settings.spec.ts's catalog test) needs the service-role client to
    // clean it up, or agencies' delete below fails on the FK and leaves
    // this whole fixture orphaned.
    ["format_directions", () => admin.from("format_directions").delete().eq("agency_id", agencyId)],
    // phase122: the workspace's proofreading rules. References agencies
    // and users, so before both.
    ["proofread_rules", () => admin.from("proofread_rules").delete().eq("agency_id", agencyId)],
    // Before phase11_agency_knowledge.sql is applied, this errors
    // (best-effort/logged, not thrown — same as every step here) rather
    // than blocking the rest of cleanup.
    ["agency_knowledge_entries", () => admin.from("agency_knowledge_entries").delete().eq("agency_id", agencyId)],
    // References clients — must run before the clients delete below, the
    // same reason format_directions/custom_columns run before agencies.
    ["knowledge_entries", () => admin.from("knowledge_entries").delete().eq("agency_id", agencyId)],
    ["client_monthly_strategies", () => admin.from("client_monthly_strategies").delete().eq("agency_id", agencyId)],
    ["client_strategy_overviews", () => admin.from("client_strategy_overviews").delete().eq("agency_id", agencyId)],
    // Both cascade from memberships anyway; swept explicitly so a failure
    // names the table instead of surfacing as a memberships FK error.
    ["invites", () => admin.from("invites").delete().eq("agency_id", agencyId)],
    ["staff_client_access", () => admin.from("staff_client_access").delete().eq("agency_id", agencyId)],
    // Points at users (requested_by); also goes with its agency (cascade).
    ["plan_requests", () => admin.from("plan_requests").delete().eq("agency_id", agencyId)],
    // Paddle's side of a plan (phase39); also goes with its agency (cascade).
    ["agency_billing", () => admin.from("agency_billing").delete().eq("agency_id", agencyId)],
    ["memberships", () => admin.from("memberships").delete().eq("agency_id", agencyId)],
    // References both agencies and users (created_by) — must run before
    // both deletes below, the same reason format_directions/
    // custom_columns run before clients/agencies. Never surfaced before
    // continuous-calendar.spec.ts: no earlier spec ever completed a real
    // "Save as New View" flow, only asserted the Save button's presence.
    ["calendar_views", () => admin.from("calendar_views").delete().eq("agency_id", agencyId)],
    // References clients — must run before the clients delete below, same
    // reason format_directions/custom_columns do.
    ["client_contacts", () => admin.from("client_contacts").delete().eq("agency_id", agencyId)],
    // References both clients (client_id) and users (created_by) — must
    // run before both deletes below, same reason format_directions/
    // custom_columns run before clients/agencies. projects.folder_id
    // itself needs no ordering against this (on delete set null).
    ["project_folders", () => admin.from("project_folders").delete().eq("agency_id", agencyId)],
    // By agency_id, not just the fixture's own client.id — new-client.spec.ts
    // creates extra clients through the real New Client modal, same reasoning
    // as shared_links above.
    // phase54: a client's Instagram connection and connect links (the
    // token row cascades with its connection).
    ["instagram_connect_links", () => admin.from("instagram_connect_links").delete().eq("agency_id", agencyId)],
    ["instagram_connections", () => admin.from("instagram_connections").delete().eq("agency_id", agencyId)],
    // Before clients (phase70; it would also go with them, but said here).
    ["client_preferences", () => admin.from("client_preferences").delete().eq("agency_id", agencyId)],
    ["clients", () => admin.from("clients").delete().eq("agency_id", agencyId)],
    // After clients (clients.logo_asset_id references assets) and after
    // every other table above that references assets (creative_versions,
    // knowledge_entries) — an asset row with anything still pointing at
    // it fails the same way an unswept child row anywhere else here does.
    // References agencies, and (logo_asset_id) assets — so before both.
    // Only exists once a spec saves branding (branding.spec.ts).
    ["agency_settings", () => admin.from("agency_settings").delete().eq("agency_id", agencyId)],
    // users.avatar_asset_id points at assets, so a profile photo set in a
    // spec has to be unlinked before the sweep below can delete it.
    [
      "users.avatar_asset_id",
      async () => {
        const { data: owned } = await admin.from("assets").select("id").eq("agency_id", agencyId);
        const ids = (owned ?? []).map((a) => a.id as string);
        if (ids.length === 0) return { error: null };
        return admin.from("users").update({ avatar_asset_id: null }).in("avatar_asset_id", ids);
      },
    ],
    ["assets", () => admin.from("assets").delete().eq("agency_id", agencyId)],
    // The files themselves (direct instruction: no test uploads left
    // behind in storage). Everything under the agency's folder, any depth.
    ["storage files", () => removeFiles(agencyId)],
    // References both agencies and users — must run before both deletes
    // below, same reason format_directions/custom_columns do. Never
    // surfaced before real classify-comment-triggered AI calls existed:
    // no earlier spec logged a row here.
    ["ai_usage_events", () => admin.from("ai_usage_events").delete().eq("agency_id", agencyId)],
    // phase50: written by a trigger whenever a spec changes the plan.
    // Cascades with the agency, but swept by name so a failure says so.
    ["plan_changes", () => admin.from("plan_changes").delete().eq("agency_id", agencyId)],
    // phase51: the admin area's actions on this agency.
    ["admin_actions", () => admin.from("admin_actions").delete().eq("agency_id", agencyId)],
    // Retried, not a single attempt: a comment posted near the end of a
    // test fires a background classify-comment call, and if the AI reply
    // lands mid-teardown, its ai_usage_events row appears *after* the
    // sweep above and blocks this delete on the FK. Re-sweep and retry
    // until the agency is gone — once it is, any later usage insert just
    // fails its own FK harmlessly instead of orphaning anything.
    [
      "agencies",
      async () => {
        let result = await admin.from("agencies").delete().eq("id", agencyId);
        for (let attempt = 0; result.error && attempt < 10; attempt++) {
          await new Promise((r) => setTimeout(r, 1000));
          await admin.from("ai_usage_events").delete().eq("agency_id", agencyId);
          result = await admin.from("agencies").delete().eq("id", agencyId);
        }
        return result;
      },
    ],
  ];
  for (const [label, run] of steps) {
    const { error } = await run();
    if (error) console.error(`Cleanup failed at ${label}:`, error);
  }
}
