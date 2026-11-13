import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorizeUrl, slackConfigured } from "@/lib/slack/api";
import { signSlackState } from "@/lib/slack/secrets";
import { slackCallbackUrl } from "@/lib/slack/store";
import { requestOrigin } from "@/lib/instagram/store";

const SETTINGS = "/settings/connections/slack";

// Add to Slack (phase154): an Owner or Admin, signed in, connects their
// workspace's Slack. Which workspace, who, and where to come back to travel
// in a signed state, checked again on the way back.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = requestOrigin(request);
  const back = (outcome: string) => NextResponse.redirect(new URL(`${SETTINGS}?slack=${outcome}`, origin));
  if (!slackConfigured()) return back("not_configured");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", origin));
  const agencyId = url.searchParams.get("agencyId") ?? "";
  const { data: isAdmin } = await supabase.rpc("is_agency_admin", { check_agency_id: agencyId });
  if (!isAdmin) return back("not_allowed");

  const redirectUri = slackCallbackUrl(request);
  const state = signSlackState({
    agencyId,
    userId: user.id,
    returnOrigin: origin,
    returnPath: SETTINGS,
    redirectUri,
    expiresAt: Date.now() + 15 * 60_000,
  });
  return NextResponse.redirect(authorizeUrl(redirectUri, state));
}
