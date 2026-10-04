import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin/require-platform-admin";
import { loadPersonDetail } from "@/lib/admin/people";

// One person: their details, and in each agency their role, clients,
// projects and any pending invite (view-only).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth) return auth.error;
  const { id } = await params;
  try {
    const person = await loadPersonDetail(auth.admin, id);
    if (!person) return NextResponse.json({ error: "No one with that id" }, { status: 404 });
    return NextResponse.json({ person });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
