#!/usr/bin/env node
// Builds the local test database (decided directly, 25 Oct 2026): a copy
// of staging's structure, never its data, in the local Supabase that
// `npx supabase start` runs in Docker. The e2e suite runs against it with
// `npm run test:local`, so tests leave staging alone.
//
// It resets the local database, copies staging's public schema (tables,
// functions, triggers, RLS, grants) with pg_dump, then adds what lives
// outside public: the citext extension, the assets bucket and its storage
// policies and limits trigger, the tables Realtime sends, and the test
// support in supabase/test-support/. It only reads staging.
//
// Run again whenever staging's schema changes (a new migration):
//   node scripts/e2e-db.mjs
// Needs Docker running and STAGING_DB_PASSWORD in .env.local.

import { execFileSync } from "child_process";
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CLI = ["--yes", "supabase@2.120.0"];
const CONTAINER = "supabase_db_frank";
const STAGING_REF = "jjzzlfmjhkegwdrlxpsc";

const env = Object.fromEntries(
  readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
);
if (!env.STAGING_DB_PASSWORD) throw new Error("STAGING_DB_PASSWORD isn't in .env.local");
// Docker's command-line tools, where Docker Desktop keeps them.
const PATH = `/Applications/Docker.app/Contents/Resources/bin:${process.env.PATH}`;
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: ROOT, env: { ...process.env, PATH }, maxBuffer: 1 << 28, ...opts });
const step = (s) => console.log(`· ${s}`);

step("Resetting the local database");
run("npx", [...CLI, "db", "reset", "--local", "--no-seed"], { stdio: "inherit" });

step("Copying staging's structure (read only)");
let schema = run("docker", [
  "exec",
  "-e",
  `PGPASSWORD=${env.STAGING_DB_PASSWORD}`,
  CONTAINER,
  "pg_dump",
  "-h",
  "aws-0-ap-northeast-1.pooler.supabase.com",
  "-p",
  "5432",
  "-U",
  `postgres.${STAGING_REF}`,
  "-d",
  "postgres",
  "--schema-only",
  "--schema=public",
  "--no-owner",
]).toString();
// The local database already has its public schema.
schema = schema.replace(/^CREATE SCHEMA public;$/m, "").replace(/^COMMENT ON SCHEMA public IS .*;$/m, "");
// Default privileges for Supabase's own roles: the local stack sets those
// itself, and only its superuser may.
schema = schema.replace(/^ALTER DEFAULT PRIVILEGES FOR ROLE .*;$/gm, "");

const extras = `
-- The dump empties the search path; what follows names public's tables.
set search_path = public, extensions;
-- Outside public on staging, needed here too.
grant usage on schema public to anon, authenticated, service_role;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assets', 'assets', false, 314572800, array[
  'image/jpeg', 'image/png', 'image/jpg', 'image/webp', 'image/gif', 'video/mp4', 'video/mov',
  'video/quicktime', 'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'
]) on conflict (id) do nothing;
create policy assets_bucket_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'assets' and public.is_agency_staff(((storage.foldername(name))[1])::uuid));
create policy assets_bucket_select on storage.objects for select to authenticated
  using (bucket_id = 'assets' and ((storage.foldername(name))[1])::uuid in (select public.current_agency_ids()));
create trigger zz_enforce_storage_limits before insert or update on storage.objects
  for each row execute function public.enforce_storage_limits();
alter publication supabase_realtime add table
  public.creatives, public.comments, public.copy_chats, public.copy_chat_messages, public.project_discussion;
`;

// The local stack grants anon, authenticated and service_role everything
// it creates in public; staging took some of that back (a function only
// the service role may call, say), and the dump states only the grants
// that are there, never those removed. So nothing is granted on creation
// while loading, and every object gets exactly staging's grants; the
// usual defaults come back after.
const roles = "anon, authenticated, service_role";
const kinds = ["tables", "sequences", "functions"];
const grantsOff = kinds
  .map((k) => `alter default privileges for role postgres in schema public revoke all on ${k} from ${roles};`)
  .join("\n");
const grantsOn = kinds
  .map((k) => `alter default privileges for role postgres in schema public grant all on ${k} to ${roles};`)
  .join("\n");

const support = readdirSync(path.join(ROOT, "supabase/test-support"))
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(path.join(ROOT, "supabase/test-support", f), "utf8"))
  .join("\n");

const dir = mkdtempSync(path.join(tmpdir(), "frank-test-db-"));
const file = path.join(dir, "load.sql");
writeFileSync(
  file,
  `create extension if not exists citext with schema public;\n${grantsOff}\n${schema}\n${extras}\n${support}\n${grantsOn}\nnotify pgrst, 'reload schema';\n`,
);

step("Loading it into the local database");
run("docker", ["cp", file, `${CONTAINER}:/tmp/load.sql`]);
run("docker", ["exec", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-f", "/tmp/load.sql"], {
  stdio: ["ignore", "ignore", "inherit"],
});

const count = (sql) =>
  run("docker", ["exec", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-tAc", sql]).toString().trim();
step(
  `Done: ${count("select count(*) from pg_tables where schemaname = 'public'")} tables, ` +
    `${count("select count(*) from pg_proc where pronamespace = 'public'::regnamespace")} functions, ` +
    `${count("select count(*) from pg_policies where schemaname = 'public'")} policies`,
);
