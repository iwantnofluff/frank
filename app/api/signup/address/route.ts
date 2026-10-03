import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { addressProblem } from "@/lib/address-check";

// Is this address free? Asked as someone types it on the sign-up form
// (phase42). Says only free or not, and why.
export async function GET(request: Request) {
  const sub = new URL(request.url).searchParams.get("sub")?.trim().toLowerCase() ?? "";
  const problem = await addressProblem(createServiceRoleClient(), sub);
  return NextResponse.json({ available: !problem, problem });
}
