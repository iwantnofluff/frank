#!/usr/bin/env node
// Empirical check for hooks/use-agency-creative-stats.ts and
// hooks/use-project-creative-stats.ts: do their plain, RLS-only-scoped
// queries actually stay inside one agency? Neither hook filters by
// agency_id client-side — both rely entirely on the projects_select and
// creatives_select RLS policies to do that job. This script creates two
// agencies with deliberately different, distinguishable creative/project
// counts, signs in as a real staff user of Agency A only, runs the exact
// same queries the hooks run, and checks the numbers came back as Agency
// A's alone.
//
// A failure here (liveProjects or creatives.length coming back higher than
// Agency A's real counts) means one of those RLS policies has regressed
// and one agency's dashboard/project-row stats would be showing another
// agency's data — a cross-tenant data leak, not just a display bug. Keep
// this alongside scripts/check-seed-sql-completeness.mjs and re-run it
// whenever those policies, the hooks' queries, or the migrations that
// define projects_select/creatives_select change; don't delete it as a
// one-time script.
//
// Read-only against app data beyond its own throwaway fixtures; cleans up
// everything it creates regardless of outcome.
//
// Run with: node scripts/check-agency-creative-stats-scoping.mjs
// Requires: SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_ANON_KEY in
// .env.local.

import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.resolve(__dirname, "..", ".env.local"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const stamp = Date.now();

async function buildAgency(label, projectCount, creativeSpecs) {
  const email = `scoping-check-${label}-${stamp}@example.invalid`;
  const password = "Scoping-Check-1234!";
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authError || !authUser.user) throw authError ?? new Error("no user");

  const { data: agency, error: agencyError } = await admin
    .from("agencies")
    .insert({ name: `Scoping Check Agency ${label}` })
    .select("id")
    .single();
  if (agencyError) throw agencyError;

  await admin.from("users").insert({ id: authUser.user.id, email, name: `Scoping ${label}` });
  await admin.from("memberships").insert({ agency_id: agency.id, user_id: authUser.user.id, role: "admin" });

  const { data: client, error: clientError } = await admin
    .from("clients")
    .insert({ agency_id: agency.id, name: `Scoping Check Client ${label}` })
    .select("id")
    .single();
  if (clientError) throw clientError;

  const projectIds = [];
  for (let i = 0; i < projectCount; i++) {
    const { data: project, error: projectError } = await admin
      .from("projects")
      .insert({ client_id: client.id, name: `Scoping Check Project ${label}-${i}`, delivery: "scheduled" })
      .select("id")
      .single();
    if (projectError) throw projectError;
    projectIds.push(project.id);
  }

  const creativeIds = [];
  for (const spec of creativeSpecs) {
    const { data: creative, error: creativeError } = await admin
      .from("creatives")
      .insert({
        project_id: projectIds[0],
        name: `Scoping Check Creative ${label}-${creativeIds.length}`,
        format: "ig_feed",
        stage: spec.stage,
        exception: spec.exception ?? null,
        scheduled_at: "2027-03-15T14:00:00.000Z",
        created_by: authUser.user.id,
      })
      .select("id")
      .single();
    if (creativeError) throw creativeError;
    creativeIds.push(creative.id);
  }

  return { label, email, password, authUserId: authUser.user.id, agencyId: agency.id, clientId: client.id, projectIds, creativeIds };
}

async function cleanup(agency) {
  const steps = [
    ["creatives", () => admin.from("creatives").delete().in("id", agency.creativeIds)],
    ["projects", () => admin.from("projects").delete().in("id", agency.projectIds)],
    ["clients", () => admin.from("clients").delete().eq("id", agency.clientId)],
    ["memberships", () => admin.from("memberships").delete().eq("agency_id", agency.agencyId)],
    ["agencies", () => admin.from("agencies").delete().eq("id", agency.agencyId)],
    ["users", () => admin.from("users").delete().eq("id", agency.authUserId)],
  ];
  for (const [label, run] of steps) {
    const { error } = await run();
    if (error) console.error(`Cleanup failed at ${label} (${agency.label}):`, error);
  }
  await admin.auth.admin.deleteUser(agency.authUserId);
}

let agencyA, agencyB;
try {
  // Agency A: 2 projects, 3 creatives — 1 review, 1 changes_requested, 1 published.
  agencyA = await buildAgency("A", 2, [
    { stage: 5 }, // review
    { stage: 4, exception: "changes_requested" },
    { stage: 8 }, // published
  ]);
  // Agency B: deliberately different numbers — 5 projects, 7 creatives, all review.
  agencyB = await buildAgency(
    "B",
    5,
    Array.from({ length: 7 }, () => ({ stage: 5 })),
  );

  const asA = createClient(SUPABASE_URL, ANON_KEY);
  const { error: signInError } = await asA.auth.signInWithPassword({
    email: agencyA.email,
    password: agencyA.password,
  });
  if (signInError) throw signInError;

  // Exact same queries as hooks/use-agency-creative-stats.ts.
  const { count: liveProjects, error: projectsError } = await asA
    .from("projects")
    .select("id", { count: "exact", head: true })
    .is("archived_at", null);
  if (projectsError) throw projectsError;

  const { data: creatives, error: creativesError } = await asA
    .from("creatives")
    .select("stage, exception")
    .is("archived_at", null);
  if (creativesError) throw creativesError;

  console.log("Signed in as Agency A's staff user.");
  console.log("Agency A actually has: 2 projects, 3 creatives.");
  console.log("Agency B actually has: 5 projects, 7 creatives.");
  console.log();
  console.log("Query result — live projects (should be 2, not 7):", liveProjects);
  console.log("Query result — total creatives visible (should be 3, not 10):", creatives.length);
  console.log();

  const correct = liveProjects === 2 && creatives.length === 3;
  console.log(correct ? "RESULT: correctly scoped to Agency A only." : "RESULT: LEAK — Agency B's rows are visible.");
  if (!correct) {
    console.log("Full creatives payload:", JSON.stringify(creatives, null, 2));
  }
} finally {
  if (agencyA) await cleanup(agencyA);
  if (agencyB) await cleanup(agencyB);
}
