import type { SupabaseClient } from "@supabase/supabase-js";
import { viaText } from "@/lib/comment-for-client";
import { createListItem, lookupUserByEmail, postMessage, SlackError } from "@/lib/slack/api";
import { listItemFields, slackMessage, type ListColumns, type SlackKind } from "@/lib/slack/message";
import { decryptSlackToken } from "@/lib/slack/secrets";

// What Slack said, in words for the project's Settings.
const PROBLEMS: Record<string, string> = {
  not_in_channel: "Frank isn't in the channel. Invite it with /invite @Frank there.",
  channel_not_found: "The channel can't be found. It may be private, deleted or renamed; pick it again.",
  is_archived: "The channel is archived. Pick another.",
  list_not_found: "The List can't be found. It may have been deleted; connect it again.",
  access_denied: "Frank can't reach the List. Share it with Frank in Slack, then try again.",
  no_permission: "Frank can't add to the List. Share it with Frank in Slack, then try again.",
  missing_scope: "Frank's Slack connection is missing a permission. Reconnect it in Settings → Connections → Slack.",
  invalid_auth: "The Slack connection no longer works. Reconnect it in Settings → Connections → Slack.",
  token_revoked: "The Slack connection no longer works. Reconnect it in Settings → Connections → Slack.",
  account_inactive: "The Slack connection no longer works. Reconnect it in Settings → Connections → Slack.",
};

interface Owed {
  id: string;
  agency_id: string;
  project_id: string;
  creative_id: string;
  comment_id: string | null;
  kind: SlackKind;
  target: "channel" | "list";
}

// Posts what's waiting (phase154): one post's (straight after something
// happens on it), or everything (the daily run). Each is claimed first
// (claim_slack_outbox), so a second send skips it. Returns how many went.
export async function deliverSlack(
  admin: SupabaseClient,
  // A workspace's own address; for one without (none should be), Frank's.
  opts: { creativeId?: string; originFor: (subdomain: string | null) => string },
): Promise<number> {
  const { data: owed, error } = await admin.rpc("claim_slack_outbox", { p_creative_id: opts.creativeId ?? null });
  if (error) throw error;
  const rows = (owed ?? []) as Owed[];
  if (!rows.length) return 0;

  const agencyIds = [...new Set(rows.map((r) => r.agency_id))];
  const projectIds = [...new Set(rows.map((r) => r.project_id))];
  const creativeIds = [...new Set(rows.map((r) => r.creative_id))];
  const commentIds = [...new Set(rows.map((r) => r.comment_id).filter((id): id is string => !!id))];
  const [conns, channels, lists, posts, comments, agencies] = await Promise.all([
    admin.from("slack_connections").select("agency_id, bot_token_enc").in("agency_id", agencyIds),
    admin.from("project_slack").select("project_id, channel_id").in("project_id", projectIds),
    admin.from("project_slack_list").select("project_id, list_id, columns").in("project_id", projectIds),
    admin
      .from("creatives")
      .select("id, name, approved_by_name, project:projects(name, client:clients(name))")
      .in("id", creativeIds),
    commentIds.length
      ? admin
          .from("comments")
          .select("id, body, guest_name, author_id, for_client, client_source, visibility, deleted_at, mentions")
          .in("id", commentIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    admin.from("agencies").select("id, name, subdomain").in("id", agencyIds),
  ]);
  const authorIds = [...new Set((comments.data ?? []).map((c) => c.author_id as string | null).filter((id): id is string => !!id))];
  const mentionedIds = [...new Set((comments.data ?? []).flatMap((c) => (c.mentions as string[] | null) ?? []))];
  const peopleIds = [...new Set([...authorIds, ...mentionedIds])];
  const [{ data: authors }, { data: clientSide }] = peopleIds.length
    ? await Promise.all([
        admin.from("users").select("id, name, email").in("id", peopleIds),
        authorIds.length
          ? admin.from("memberships").select("user_id").in("user_id", authorIds).not("client_id", "is", null)
          : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      ])
    : [{ data: [] }, { data: [] }];

  const tokenOf = new Map((conns.data ?? []).map((c) => [c.agency_id as string, c.bot_token_enc as string]));
  const channelOf = new Map((channels.data ?? []).map((c) => [c.project_id as string, c.channel_id as string]));
  const postOf = new Map((posts.data ?? []).map((p) => [p.id as string, p]));
  const commentOf = new Map((comments.data ?? []).map((c) => [c.id as string, c]));
  const agencyOf = new Map((agencies.data ?? []).map((a) => [a.id as string, a]));
  const nameOf = new Map((authors ?? []).map((u) => [u.id as string, u.name as string]));
  const emailOf = new Map((authors ?? []).map((u) => [u.id as string, u.email as string]));
  const listOf = new Map((lists.data ?? []).map((l) => [l.project_id as string, l]));
  // Each workspace's key, decrypted once; each person's Slack ID, looked
  // up once (null when Slack has no one with their email).
  const tokens = new Map<string, string>();
  const tokenFor = (agencyId: string) => {
    if (!tokens.has(agencyId)) tokens.set(agencyId, decryptSlackToken(tokenOf.get(agencyId)!));
    return tokens.get(agencyId)!;
  };
  const slackIds = new Map<string, string | null>();
  const slackIdFor = async (agencyId: string, userId: string) => {
    const email = emailOf.get(userId);
    if (!email) return null;
    const key = `${agencyId}|${email}`;
    if (!slackIds.has(key)) slackIds.set(key, await lookupUserByEmail(tokenFor(agencyId), email).catch(() => null));
    return slackIds.get(key)!;
  };
  const isClientSide = new Set((clientSide ?? []).map((m) => m.user_id as string));

  let sent = 0;
  for (const row of rows) {
    const done = (fields: Record<string, unknown>) => admin.from("slack_outbox").update(fields).eq("id", row.id);
    const enc = tokenOf.get(row.agency_id);
    const list = row.target === "list" ? listOf.get(row.project_id) : null;
    const channel = row.target === "list" ? (list?.list_id as string | undefined) : channelOf.get(row.project_id);
    const table = row.target === "list" ? "project_slack_list" : "project_slack";
    const post = postOf.get(row.creative_id);
    const comment = row.comment_id ? commentOf.get(row.comment_id) : null;
    // Disconnected, the channel or List taken off, or the comment deleted since:
    // nothing to say, so it's closed without posting.
    if (!enc || !channel || !post || (row.comment_id && (!comment || comment.deleted_at))) {
      await done({ sent_at: new Date().toISOString(), error: "nothing_to_send" });
      continue;
    }
    const project = post.project as unknown as { name: string; client: { name: string } | null } | null;
    const clientName = project?.client?.name ?? null;
    const agency = agencyOf.get(row.agency_id);
    const authorName = comment?.author_id ? (nameOf.get(comment.author_id as string) ?? "Someone") : null;
    const who =
      row.kind === "client_approval"
        ? `${(post.approved_by_name as string | null) ?? "The client"}${clientName ? ` (${clientName})` : ""}`
        : comment?.for_client
          ? `The client, ${viaText(authorName ?? "the team", comment.client_source as string | null)}`
          : comment && !comment.author_id
            ? `${(comment.guest_name as string | null) ?? "The client"}${clientName ? ` (${clientName})` : ""}`
            : comment && isClientSide.has(comment.author_id as string)
              ? `${authorName}${clientName ? ` (${clientName})` : ""}`
              : `${authorName}${agency?.name ? ` (${agency.name})` : ""}`;
    // Always a whole address: Slack refuses a button without one.
    const base = opts.originFor((agency?.subdomain as string | null) ?? null);
    // Whoever's mentioned, tagged in a channel's post (phase155).
    // In the order they're named in the comment.
    const body = (comment?.body as string | undefined) ?? "";
    const at = (id: string) => {
      const i = body.indexOf(`@${nameOf.get(id) ?? ""}`);
      return i < 0 ? Infinity : i;
    };
    const mentions =
      row.target === "channel" && comment
        ? await Promise.all(
            [...((comment.mentions as string[] | null) ?? [])]
              .sort((a, b) => at(a) - at(b))
              .map(async (id) => ({
                name: nameOf.get(id) ?? "Someone",
                slackId: await slackIdFor(row.agency_id, id),
              })),
          )
        : [];
    const event = {
      kind: row.kind,
      who,
      postName: post.name as string,
      projectName: project?.name ?? "",
      clientName,
      body: (comment?.body as string | undefined) ?? null,
      isPrivate: comment?.visibility === "private",
      url: `${base}/creatives/${row.creative_id}${row.comment_id ? `?comment=${row.comment_id}` : ""}`,
      mentions,
    };
    try {
      if (row.target === "list") {
        await createListItem(tokenFor(row.agency_id), channel, listItemFields((list!.columns ?? {}) as ListColumns, event));
      } else {
        await postMessage(tokenFor(row.agency_id), channel, slackMessage(event));
      }
      await done({ sent_at: new Date().toISOString(), error: null });
      await admin.from(table).update({ last_error: null, last_error_at: null }).eq("project_id", row.project_id).not("last_error", "is", null);
      sent++;
    } catch (e) {
      const code = e instanceof SlackError ? e.code : "send_failed";
      console.error("Slack post failed", { outbox: row.id, code });
      await done({ error: code, claimed_at: null });
      await admin
        .from(table)
        .update({ last_error: PROBLEMS[code] ?? `Slack said: ${code}`, last_error_at: new Date().toISOString() })
        .eq("project_id", row.project_id);
    }
  }
  return sent;
}
