import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin/require-platform-admin";
import { loadOverview } from "@/lib/admin/overview";

// How Frank is doing, and which agencies need a look.
export async function GET() {
  const auth = await requirePlatformAdmin();
  if ("error" in auth) return auth.error;
  try {
    return NextResponse.json({ overview: await loadOverview(auth.admin) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
