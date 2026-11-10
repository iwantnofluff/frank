import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { ensureSample } from "@/lib/sample/ensure";
import { sampleCaller } from "@/lib/sample/route-auth";

// Reset the Sample Client, in Preferences (phase146): put back as it was,
// shown or hidden as it is now. Owners and Admins.
export async function POST(request: Request) {
  const { agencyId } = (await request.json().catch(() => ({}))) as { agencyId?: string };
  if (!agencyId) return NextResponse.json({ error: "agencyId is required" }, { status: 400 });
  const caller = await sampleCaller(agencyId);
  if (!caller?.admin) return NextResponse.json({ error: "Only Owners and Admins can reset the sample client" }, { status: 403 });
  try {
    return NextResponse.json(await ensureSample(createServiceRoleClient(), agencyId, caller.userId, true));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't reset the sample client" }, { status: 500 });
  }
}
