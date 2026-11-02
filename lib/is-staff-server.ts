import type { SupabaseClient } from "@supabase/supabase-js";

// Whether the person signed in is on this workspace's team (a membership
// with no client), read on the server so a staff-only page arrives drawn
// rather than blank while the browser asks (useIsStaff is the browser's
// answer, from the same rows). The session is the one the proxy has just
// checked; its id is verified here again from the token's signature, and
// RLS shows only the person's own memberships, narrowed to this address's
// workspace (lib/supabase/server.ts).
export async function isStaffServer(supabase: SupabaseClient): Promise<boolean> {
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return false;
  const { data } = await supabase
    .from("memberships")
    .select("id")
    .eq("user_id", userId)
    .is("client_id", null)
    .is("removed_at", null)
    .not("accepted_at", "is", null)
    .limit(1);
  return !!data?.length;
}
