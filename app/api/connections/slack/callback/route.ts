import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { exchangeCode } from "@/lib/slack/api";
import { encryptSlackToken, verifySlackState } from "@/lib/slack/secrets";
import { ROOT_DOMAIN } from "@/lib/tenant";

// Where Slack sends people back (phase154), at the environment's front
// door. The signed state says which workspace, who started it and where to
// return to; nothing else in the request is trusted. The connection is
// saved with the service role (no one else can read the key), and they go
// back to their workspace's address.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = verifySlackState(url.searchParams.get("state"));
  if (!state) return new NextResponse("This Slack sign-in has expired. Start again from Frank.", { status: 400 });
  if (new URL(state.redirectUri).pathname !== "/api/connections/slack/callback") {
    return new NextResponse("Unexpected callback address", { status: 400 });
  }
  const origin = new URL(state.returnOrigin);
  const root = ROOT_DOMAIN.split(":")[0];
  if (!(origin.hostname.endsWith(`.${root}`) || origin.hostname.endsWith(".frank.localhost"))) {
    return new NextResponse("Unexpected return address", { status: 400 });
  }
  const back = (outcome: string, detail?: string) => {
    const to = new URL(state.returnPath, origin);
    to.searchParams.set("slack", outcome);
    if (detail) to.searchParams.set("detail", detail.slice(0, 200));
    return NextResponse.redirect(to);
  };

  const code = url.searchParams.get("code");
  if (!code) return back("cancelled");

  const admin = createServiceRoleClient();
  try {
    // Still an Owner or Admin there, now as when it started.
    const { data: member } = await admin
      .from("memberships")
      .select("role")
      .eq("agency_id", state.agencyId)
      .eq("user_id", state.userId)
      .is("client_id", null)
      .is("removed_at", null)
      .maybeSingle();
    if (!member || !["admin", "owner", "primary_owner"].includes(member.role as string)) return back("not_allowed");

    const { token, teamId, teamName } = await exchangeCode(code, state.redirectUri);
    const { data: who } = await admin.from("users").select("name, email").eq("id", state.userId).maybeSingle();
    const { error } = await admin.from("slack_connections").upsert({
      agency_id: state.agencyId,
      team_id: teamId,
      team_name: teamName,
      bot_token_enc: encryptSlackToken(token),
      connected_by: state.userId,
      connected_by_name: (who?.name as string) || (who?.email as string) || null,
      connected_at: new Date().toISOString(),
    });
    if (error) throw error;
    return back("connected");
  } catch (e) {
    // In the server log for diagnosis: never the code or a key.
    console.error("Slack connect failed", { agencyId: state.agencyId, error: (e as Error).message });
    return back("failed", (e as Error).message);
  }
}
