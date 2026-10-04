import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { lookupInvite } from "@/lib/invites/lookup";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  if (!body?.token) return NextResponse.json({ status: "not_found" }, { status: 400 });

  const result = await lookupInvite(createServiceRoleClient(), body.token);
  if (result.status !== "ok") return NextResponse.json({ status: result.status });

  return NextResponse.json({
    status: "ok",
    email: result.email,
    agencyName: result.agencyName,
    role: result.role,
    clientName: result.clientName,
    firstName: result.firstName,
    lastName: result.lastName,
    needsPassword: result.needsPassword,
  });
}
