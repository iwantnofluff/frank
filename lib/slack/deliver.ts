import type { SupabaseClient } from "@supabase/supabase-js";
import { viaText } from "@/lib/comment-for-client";
import { lookupUserByEmail, postMessage, SlackError } from "@/lib/slack/api";
import { slackMessage, slackThreadHeader, type SlackKind } from "@/lib/slack/message";
import { decryptSlackToken } from "@/lib/slack/secrets";

// What Slack said, in words for the project's Settings.
const PROBLEMS: Record<string, string> = {
  not_in_channel: "Frank isn't in the channel. Invite it with /invite @Frank there.",
  channel_not_found: "The channel can't be found. It may be private, deleted or renamed; pick it again.",
  is_archived: "The channel is archived. Pick another.",
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

// A reply aimed at a thread whose header message has gone (deleted in
// Slack): a new thread is started instead.
const THREAD_GONE = new Set(["thread_not_found", "message_not_found", "invalid_thread_ts"]);

// Posts what's waiting (phase154): one post's (straight after something
// happens on it), or everything (the daily run). Each is claimed first
// (claim_slack_outbox), so a second send skips it. Each goes into the
// project's thread in its channel (phase156), started by the first. Returns
// how many went.
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
  const [conns, channels, posts, comments, agencies] = await Promise.all([
    admin.from("slack_connections").select("agency_id, bot_token_enc").in("agency_id", agencyIds),
    admin.from("project_slack").select("project_id, channel_id, thread_ts").in("project_id", projectIds),
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
  // Each project's thread, once known or started in this send.
  const threadOf = new Map((channels.data ?? []).map((c) => [c.project_id as string, (c.thread_ts as string | null) ?? null]));
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
    const channel = channelOf.get(row.project_id);
    const post = postOf.get(row.creative_id);
    const comment = row.comment_id ? commentOf.get(row.comment_id) : null;
    // Disconnected, the channel taken off, the comment deleted since, or
    // owed to a List (phase155, set aside in phase156): nothing to say, so
    // it's closed without posting.
    if (row.target === "list" || !enc || !channel || !post || (row.comment_id && (!comment || comment.deleted_at))) {
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
    // Whoever's mentioned, tagged in the post (phase155), in the order the
    // comment names them.
    const body = (comment?.body as string | undefined) ?? "";
    const at = (id: string) => {
      const i = body.indexOf(`@${nameOf.get(id) ?? ""}`);
      return i < 0 ? Infinity : i;
    };
    const mentions = comment
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
    // The project's thread: the one it has, or a new one, its header posted
    // first. Should another send have started one meanwhile, that one's kept.
    const token = tokenFor(row.agency_id);
    const threadFor = async () => {
      const known = threadOf.get(row.project_id);
      if (known) return known;
      const started = await postMessage(
        token,
        channel,
        slackThreadHeader({ projectName: project?.name ?? "This project", clientName, url: `${base}/projects/${row.project_id}` }),
      );
      const { data: kept } = await admin
        .from("project_slack")
        .update({ thread_ts: started })
        .eq("project_id", row.project_id)
        .eq("channel_id", channel)
        .is("thread_ts", null)
        .select("thread_ts");
      let ts = started;
      if (!kept?.length) {
        const { data: now } = await admin.from("project_slack").select("thread_ts").eq("project_id", row.project_id).maybeSingle();
        ts = (now?.thread_ts as string | null) ?? started;
      }
      threadOf.set(row.project_id, ts);
      return ts;
    };
    try {
      const message = slackMessage(event);
      try {
        await postMessage(token, channel, { ...message, thread_ts: await threadFor() });
      } catch (e) {
        if (!(e instanceof SlackError && THREAD_GONE.has(e.code))) throw e;
        // Its header was deleted: forget it and start again, once.
        const gone = threadOf.get(row.project_id);
        threadOf.set(row.project_id, null);
        await admin.from("project_slack").update({ thread_ts: null }).eq("project_id", row.project_id).eq("thread_ts", gone);
        await postMessage(token, channel, { ...message, thread_ts: await threadFor() });
      }
      await done({ sent_at: new Date().toISOString(), error: null });
      await admin.from("project_slack").update({ last_error: null, last_error_at: null }).eq("project_id", row.project_id).not("last_error", "is", null);
      sent++;
    } catch (e) {
      const code = e instanceof SlackError ? e.code : "send_failed";
      console.error("Slack post failed", { outbox: row.id, code });
      await done({ error: code, claimed_at: null });
      await admin
        .from("project_slack")
        .update({ last_error: PROBLEMS[code] ?? `Slack said: ${code}`, last_error_at: new Date().toISOString() })
        .eq("project_id", row.project_id);
    }
  }
  return sent;
}
