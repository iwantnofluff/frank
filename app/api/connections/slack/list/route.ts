import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { listIdFrom, readList, SlackError } from "@/lib/slack/api";
import { matchListColumns } from "@/lib/slack/message";
import { decryptSlackToken } from "@/lib/slack/secrets";

// A List connected to a project (phase155): from its link, an Owner or
// Admin's; read with the workspace's key (which stays here) for its title
// and the columns Frank will fill.
const PROBLEMS: Record<string, string> = {
  list_not_found: "Slack can't find that List. Copy its link again from the List's ⋯ menu.",
  access_denied: "Frank can't open that List. Share it with Frank in Slack, then try again.",
  no_permission: "Frank can't open that List. Share it with Frank in Slack, then try again.",
  missing_scope: "Frank's Slack connection needs Lists. Reconnect it in Settings → Connections → Slack.",
  list_columns_unknown: "Frank couldn't read that List's columns. Add one item to it in Slack, then try again.",
};

export async function POST(request: Request) {
  const { agencyId, link } = (await request.json().catch(() => ({}))) as { agencyId?: string; link?: string };
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_agency_admin", { check_agency_id: agencyId ?? "" });
  if (!isAdmin) return NextResponse.json({ error: "Only Owners and Admins can connect a List." }, { status: 403 });
  const listId = listIdFrom(link ?? "");
  if (!listId) return NextResponse.json({ error: "That isn't a List's link. In Slack, open the List, then ⋯ → Copy link." }, { status: 400 });

  const { data: conn } = await createServiceRoleClient()
    .from("slack_connections")
    .select("bot_token_enc")
    .eq("agency_id", agencyId!)
    .maybeSingle();
  if (!conn) return NextResponse.json({ error: "Slack isn't connected." }, { status: 409 });
  try {
    const list = await readList(decryptSlackToken(conn.bot_token_enc as string), listId);
    const columns = matchListColumns(list.columns);
    if (!columns.title) return NextResponse.json({ error: "That List's first column isn't text, so Frank has nowhere to write." }, { status: 422 });
    return NextResponse.json({ listId, title: list.title, columns });
  } catch (e) {
    const code = e instanceof SlackError ? e.code : "failed";
    return NextResponse.json({ error: PROBLEMS[code] ?? `Slack said: ${code}` }, { status: 502 });
  }
}
