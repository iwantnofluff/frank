import { admin, sweepAgency, TEST_AGENCY_NAME } from "./sweep";

// Before every run (decided directly, 25 Oct 2026): any test workspace a
// stopped run left behind is removed, so they never pile up (159 had,
// slowing every test's setup). Only ones over 15 minutes old, so a second
// run going at the same time (a throwaway spec while the suite runs)
// keeps its own. With them go the test accounts specs invited into them,
// once they belong to nothing else; the fixture's reused accounts
// (e2e-pool-…) stay.
const LEFT_FOR = 15 * 60 * 1000;

export default async function globalSetup() {
  const before = new Date(Date.now() - LEFT_FOR).toISOString();
  const { data: left, error } = await admin.from("agencies").select("id").eq("name", TEST_AGENCY_NAME).lt("created_at", before);
  if (error) throw error;
  if (!left?.length) return;
  console.log(`Removing ${left.length} test workspace${left.length === 1 ? "" : "s"} a stopped run left behind…`);
  for (const { id } of left) {
    const { data: members } = await admin
      .from("memberships")
      .select("user_id, user:users!memberships_user_id_fkey(email)")
      .eq("agency_id", id);
    await sweepAgency(id);
    for (const m of members ?? []) {
      const email = (m.user as unknown as { email: string } | null)?.email ?? "";
      if (!email.endsWith("@example.invalid") || email.startsWith("e2e-pool-")) continue;
      const { data: elsewhere } = await admin.from("memberships").select("id").eq("user_id", m.user_id).limit(1);
      if (elsewhere?.length) continue;
      await admin.from("users").delete().eq("id", m.user_id);
      await admin.auth.admin.deleteUser(m.user_id as string);
    }
  }
}
