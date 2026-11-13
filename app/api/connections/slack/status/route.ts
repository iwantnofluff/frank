import { NextResponse } from "next/server";
import { slackConfigured } from "@/lib/slack/api";

// Whether Frank's Slack app is set up here yet (phase154), so Settings can
// say so instead of sending people to a sign-in that can't work.
export async function GET() {
  return NextResponse.json({ configured: slackConfigured() });
}
