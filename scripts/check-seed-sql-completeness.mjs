#!/usr/bin/env node
// Checks supabase/seed.sql's declared tables, columns and RPC/helper
// functions against the live database. Read-only, changes nothing.
//
// This is what docs/phase5-baseline-note.md's completeness claim is based
// on — re-run this if seed.sql or the live schema changes, rather than
// re-trusting a stale claim. What it can and can't see is documented at
// the end of that note and at the bottom of
// supabase/migrations/phase0_baseline.sql; the short version: it can only
// confirm declared objects exist, not that nothing undeclared also exists,
// and it can't see RLS policy text, trigger definitions, or constraints at
// all (no direct Postgres connection is configured — only the service-role
// API key, which goes through PostgREST).
//
// Run with: node scripts/check-seed-sql-completeness.mjs
// Requires: SUPABASE_SERVICE_ROLE_KEY in .env.local.

import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.resolve(__dirname, "..", ".env.local"));

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

// Exact column lists as declared in supabase/seed.sql. Deliberately
// explicit rather than `select('*')` — a wildcard select doesn't reference
// specific columns, so it can't catch a column seed.sql declares that the
// live table doesn't actually have.
const TABLE_COLUMNS = {
  agencies: "id,name,subdomain,plan,plan_renews_at,storage_bytes_used,seat_limit,created_at,archived_at",
  users: "id,email,name,avatar_asset_id,last_seen_at,created_at",
  clients: "id,agency_id,name,industry,logo_asset_id,accent_colour,created_at,archived_at",
  assets: "id,agency_id,storage_key,filename,mime_type,bytes,width,height,duration_seconds,checksum,created_by,created_at",
  memberships: "id,agency_id,user_id,role,client_id,invited_by,invited_at,accepted_at,removed_at",
  projects: "id,agency_id,client_id,name,delivery,type,accent_colour,due_on,position,created_at,archived_at",
  creatives:
    "id,agency_id,project_id,name,format,stage,exception,lead_user_id,concept,reference_url,approach_notes,scheduled_at,platforms,destination,added_on,due_on,published_at,approved_at,approved_by_name,approved_by_email,position,cx,created_by,created_at,archived_at",
  custom_columns: "id,agency_id,project_id,key,label,type,options,position,created_at,archived_at",
  knowledge_entries: "id,agency_id,client_id,section,kind,title,body,url,author_id,created_at",
  format_directions:
    "id,agency_id,format_id,direction_text,caption_chars,sentences_min,sentences_max,artwork_lines,words_per_line,caps_rule,created_at",
  agency_settings: "agency_id,theme,terms,logo_asset_id,created_at,updated_at",
  shared_links:
    "id,agency_id,project_id,token,scope,creative_id,picked_creatives,expires_at,requires_passcode,passcode_hash,can_approve,created_by,revoked_at,created_at",
  creative_versions: "id,agency_id,creative_id,version_no,asset_id,note,created_by,created_at",
  copy_versions:
    "id,agency_id,creative_id,version_no,fields,slide_text,source,source_comment_id,note,created_by,created_at",
  comments:
    "id,agency_id,creative_id,parent_id,author_id,guest_name,guest_email,body,anchor,creative_version_id,copy_version_id,suggestion,visibility,resolved_at,resolved_by,created_at,edited_at,deleted_at",
};

const RPCS = [
  { name: "current_agency_ids", args: {} },
  { name: "is_agency_staff", args: { check_agency_id: "00000000-0000-0000-0000-000000000000" } },
  { name: "is_agency_admin", args: { check_agency_id: "00000000-0000-0000-0000-000000000000" } },
  { name: "current_client_ids", args: { check_agency_id: "00000000-0000-0000-0000-000000000000" } },
  { name: "create_shared_link", args: { p_project_id: "00000000-0000-0000-0000-000000000000", p_scope: "all" } },
  { name: "shared_link_allowed_creative_ids", args: { v_link: null } },
  { name: "get_shared_review", args: { p_token: "___nonexistent___", p_passcode: null } },
  {
    name: "submit_shared_comment",
    args: {
      p_token: "___nonexistent___",
      p_passcode: null,
      p_creative_id: "00000000-0000-0000-0000-000000000000",
      p_body: "x",
      p_guest_name: "x",
      p_guest_email: "x",
    },
  },
  {
    name: "submit_shared_approval",
    args: {
      p_token: "___nonexistent___",
      p_passcode: null,
      p_creative_id: "00000000-0000-0000-0000-000000000000",
      p_guest_name: "x",
      p_guest_email: "x",
    },
  },
];

let failures = 0;

console.log("=== Tables + declared columns ===");
for (const [table, columns] of Object.entries(TABLE_COLUMNS)) {
  const { error } = await admin.from(table).select(columns).limit(0);
  if (error) {
    failures++;
    console.log(`MISMATCH: ${table} — ${error.code ?? ""} ${error.message}`);
  } else {
    console.log(`ok (${columns.split(",").length} columns present): ${table}`);
  }
}

console.log();
console.log("=== RPC / helper functions ===");
for (const { name, args } of RPCS) {
  const { error } = await admin.rpc(name, args);
  if (error && (error.code === "PGRST202" || /Could not find the function/i.test(error.message))) {
    failures++;
    console.log(`MISSING: ${name} — ${error.message}`);
  } else if (error) {
    console.log(`exists (errored on dummy args, expected): ${name} — ${error.code ?? ""} ${error.message}`);
  } else {
    console.log(`exists (no error on dummy args): ${name}`);
  }
}

console.log();
console.log(failures === 0 ? "All declared objects confirmed present." : `${failures} mismatch(es) found.`);
process.exitCode = failures === 0 ? 0 : 1;
