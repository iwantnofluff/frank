import { NextResponse } from "next/server";
import { CURRENT_RELEASE } from "@/lib/releases";

// The version of Frank deployed now (lib/releases.ts), so a tab opened on an
// older one can offer to reload (direct instruction). Never cached.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ version: CURRENT_RELEASE.version }, { headers: { "Cache-Control": "no-store" } });
}
