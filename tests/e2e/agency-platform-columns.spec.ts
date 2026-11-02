import { createClient } from "@supabase/supabase-js";
import { test, expect } from "./fixtures";

// A workspace's own people change its name and AI model, and nothing else
// on agencies (phase129, phase130). Found 2 Nov 2026: an Owner's plain
// update through the API set their plan to Enterprise, added AI requests,
// moved their trial out and cleared a pause. Checked here as the fixture's
// Admin and as its Owner, through their own sessions, as the app would.

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
async function signIn(email: string, password: string) {
  const c = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}

test("a workspace's Owner and Admin can't change its plan, trial, extras, pause or Internal", async ({ frank }) => {
  const before = (
    await admin
      .from("agencies")
      .select("plan, trial_ends_at, suspended_at, extra_ai_requests, ai_monthly_request_cap, is_internal")
      .eq("id", frank.agencyId)
      .single()
  ).data!;

  for (const role of ["admin", "owner"] as const) {
    await admin
      .from("memberships")
      .update({ role })
      .eq("agency_id", frank.agencyId)
      .is("client_id", null)
      .neq("role", "primary_owner");
    const staff = await signIn(frank.staffEmail, frank.staffPassword);

    for (const change of [
      { plan: "enterprise" },
      { extra_ai_requests: 50_000 },
      { trial_ends_at: new Date(Date.now() + 5 * 365 * 86_400_000).toISOString() },
      { suspended_at: new Date().toISOString() },
      { is_internal: true },
    ]) {
      const { error } = await staff.from("agencies").update(change).eq("id", frank.agencyId);
      expect(error?.message, `${role}: ${JSON.stringify(change)}`).toContain("Only Frank can change");
    }

    // What the app does let them change still saves.
    const { data: renamed, error } = await staff
      .from("agencies")
      .update({ name: "E2E Test Agency", ai_default_model: "claude-haiku-5-5" })
      .eq("id", frank.agencyId)
      .select("ai_default_model");
    expect(error).toBeNull();
    expect(renamed).toEqual([{ ai_default_model: "claude-haiku-5-5" }]);
  }

  const after = (
    await admin
      .from("agencies")
      .select("plan, trial_ends_at, suspended_at, extra_ai_requests, ai_monthly_request_cap, is_internal")
      .eq("id", frank.agencyId)
      .single()
  ).data!;
  expect(after).toEqual(before);

  // Frank's own server still can (Paddle's webhook, the admin area).
  const { data: served, error } = await admin
    .from("agencies")
    .update({ plan: "growth" })
    .eq("id", frank.agencyId)
    .select("plan");
  expect(error).toBeNull();
  expect(served).toEqual([{ plan: "growth" }]);
});
