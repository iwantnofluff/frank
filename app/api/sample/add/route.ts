import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { seedSampleClient } from "@/lib/sample/seed";
import { sampleCaller } from "@/lib/sample/route-auth";

// Add the Sample Client, from Workspace Settings → Preferences (direct
// instruction): for a workspace without one, made before samples were, or
// whose sample was removed. Owners and Admins; one sample at a time. Made as
// sign-up makes it (lib/sample/seed.ts), with its 7 days starting now.
export async function POST(request: Request) {
  let agencyId: string | undefined;
  try {
    ({ agencyId } = await request.json());
  } catch {
    return NextResponse.json({ error: "agencyId is required" }, { status: 400 });
  }
  if (!agencyId) return NextResponse.json({ error: "agencyId is required" }, { status: 400 });

  const caller = await sampleCaller(agencyId);
  if (!caller?.admin) return NextResponse.json({ error: "Only Owners and Admins can add the sample client" }, { status: 403 });
  const user = { id: caller.userId };

  const admin = createServiceRoleClient();
  const { data: existing } = await admin.from("clients").select("id").eq("agency_id", agencyId).eq("is_sample", true).limit(1);
  if (existing?.length) return NextResponse.json({ error: "Your workspace already has the sample client" }, { status: 409 });

  const clientId = await seedSampleClient(admin, agencyId, user.id);
  if (!clientId) return NextResponse.json({ error: "Couldn't add the sample client" }, { status: 500 });
  await admin
    .from("clients")
    .update({ sample_expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString() })
    .eq("id", clientId);
  return NextResponse.json({ clientId }, { status: 201 });
}
