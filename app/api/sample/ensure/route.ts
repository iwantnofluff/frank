import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { ensureSample } from "@/lib/sample/ensure";
import { sampleCaller } from "@/lib/sample/route-auth";

// Before Frank Tour or a Show Me (phase146): the workspace's sample client,
// made (hidden) if it has none, reset if it's missing something the tour
// points at, and where each step should go. Anyone on the team.
export async function POST(request: Request) {
  const { agencyId } = (await request.json().catch(() => ({}))) as { agencyId?: string };
  if (!agencyId) return NextResponse.json({ error: "agencyId is required" }, { status: 400 });
  const caller = await sampleCaller(agencyId);
  if (!caller) return NextResponse.json({ error: "Only the workspace's team can do this" }, { status: 403 });
  try {
    return NextResponse.json(await ensureSample(createServiceRoleClient(), agencyId, caller.userId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't get the sample client ready" }, { status: 500 });
  }
}
