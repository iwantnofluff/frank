import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Every /api/admin route starts here (phase37): the signed-in person has
// to be on platform_admins, which only the service role can read. Only
// then does the route get the service-role client to read across agencies.
export async function requirePlatformAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) } as const;
  const admin = createServiceRoleClient();
  const { data } = await admin.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!data) return { error: NextResponse.json({ error: "Not a platform admin" }, { status: 403 }) } as const;
  return { admin, user } as const;
}
