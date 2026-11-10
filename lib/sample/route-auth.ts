import { createClient } from "@/lib/supabase/server";

// Who's asking, for the sample's routes: someone on the workspace's own team
// (not one of a client's people), and whether they're an Owner or Admin.
export async function sampleCaller(agencyId: string): Promise<{ userId: string; admin: boolean } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: membership } = await supabase
    .from("memberships")
    .select("role")
    .eq("agency_id", agencyId)
    .eq("user_id", user.id)
    .is("client_id", null)
    .is("removed_at", null)
    .not("accepted_at", "is", null)
    .maybeSingle();
  if (!membership) return null;
  return { userId: user.id, admin: ["admin", "owner", "primary_owner"].includes(membership.role as string) };
}
