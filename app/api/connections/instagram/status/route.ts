import { NextResponse } from "next/server";
import { instagramConfigured } from "@/lib/instagram/api";

// Whether Frank's Meta app is set up here yet (phase54), so the Connections
// page can say so instead of sending people to a sign-in that can't work.
export async function GET() {
  return NextResponse.json({ configured: instagramConfigured() });
}
