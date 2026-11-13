import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { listChannels, SlackError } from "@/lib/slack/api";
import { decryptSlackToken } from "@/lib/slack/secrets";

// The channels a project can post to (phase154), for an Owner or Admin
// choosing one in Project Settings: public ones, and private ones Frank has
// been invited into. Read with the workspace's key, which never leaves the
// server.
export async function GET(request: Request) {
  const agencyId = new URL(request.url).searchParams.get("agencyId") ?? "";
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_agency_admin", { check_agency_id: agencyId });
  if (!isAdmin) return NextResponse.json({ error: "Only Owners and Admins can choose a channel." }, { status: 403 });

  const { data: conn } = await createServiceRoleClient()
    .from("slack_connections")
    .select("bot_token_enc")
    .eq("agency_id", agencyId)
    .maybeSingle();
  if (!conn) return NextResponse.json({ error: "Slack isn't connected." }, { status: 409 });
  try {
    return NextResponse.json({ channels: await listChannels(decryptSlackToken(conn.bot_token_enc as string)) });
  } catch (e) {
    const code = e instanceof SlackError ? e.code : "failed";
    return NextResponse.json({ error: `Slack didn't list the channels (${code}).` }, { status: 502 });
  }
}
