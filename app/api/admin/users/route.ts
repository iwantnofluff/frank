import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin/require-platform-admin";
import { loadPeople } from "@/lib/admin/people";

// Everyone on Frank, with their agencies and roles (view-only).
export async function GET() {
  const auth = await requirePlatformAdmin();
  if ("error" in auth) return auth.error;
  try {
    return NextResponse.json({ people: await loadPeople(auth.admin) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
