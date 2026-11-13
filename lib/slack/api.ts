// Server-only (phase154): the few Slack Web API calls Frank makes. Frank's
// Slack app is registered once at api.slack.com; SLACK_CLIENT_ID and
// SLACK_CLIENT_SECRET name it, SLACK_TOKEN_KEY encrypts each workspace's bot
// key (lib/slack/secrets.ts).

// Slack itself, or a stand-in during the local test run
// (scripts/e2e-local.mjs, tests/e2e/slack.spec.ts).
const SLACK = process.env.SLACK_API_BASE || "https://slack.com";

// Posting (to public channels without joining them first), and listing
// public and private channels for the picker (private ones only once Frank
// has been invited in); finding someone mentioned by their email, to tag
// them; and a project's List, read and added to (phase155).
export const SLACK_SCOPES = [
  "chat:write",
  "chat:write.public",
  "channels:read",
  "groups:read",
  "users:read",
  "users:read.email",
  "lists:read",
  "lists:write",
];

export function slackConfigured(): boolean {
  return !!process.env.SLACK_CLIENT_ID && !!process.env.SLACK_CLIENT_SECRET && !!process.env.SLACK_TOKEN_KEY;
}

export function authorizeUrl(redirectUri: string, state: string): string {
  const url = new URL(`${SLACK}/oauth/v2/authorize`);
  url.searchParams.set("client_id", process.env.SLACK_CLIENT_ID!);
  url.searchParams.set("scope", SLACK_SCOPES.join(","));
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

interface SlackReply {
  ok: boolean;
  error?: string;
}

// Slack answers 200 with ok: false for its own errors ("not_in_channel",
// "invalid_auth"…), so both kinds are turned into a thrown SlackError.
export class SlackError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

async function call<T extends SlackReply>(res: Response): Promise<T> {
  if (!res.ok) throw new SlackError(`http_${res.status}`);
  const body = (await res.json()) as T;
  if (!body.ok) throw new SlackError(body.error ?? "unknown_error");
  return body;
}

export async function exchangeCode(code: string, redirectUri: string) {
  const res = await fetch(`${SLACK}/api/oauth.v2.access`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.SLACK_CLIENT_ID!,
      client_secret: process.env.SLACK_CLIENT_SECRET!,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const body = await call<SlackReply & { access_token: string; team: { id: string; name: string } }>(res);
  return { token: body.access_token, teamId: body.team.id, teamName: body.team.name };
}

export interface SlackChannel {
  id: string;
  name: string;
  isPrivate: boolean;
}

// Every channel Frank can post to: public ones, and private ones it's in.
export async function listChannels(token: string): Promise<SlackChannel[]> {
  const out: SlackChannel[] = [];
  let cursor = "";
  for (let page = 0; page < 20; page++) {
    const url = new URL(`${SLACK}/api/conversations.list`);
    url.searchParams.set("types", "public_channel,private_channel");
    url.searchParams.set("exclude_archived", "true");
    url.searchParams.set("limit", "999");
    if (cursor) url.searchParams.set("cursor", cursor);
    const body = await call<
      SlackReply & {
        channels: { id: string; name: string; is_private: boolean }[];
        response_metadata?: { next_cursor?: string };
      }
    >(await fetch(url, { headers: { Authorization: `Bearer ${token}` } }));
    for (const c of body.channels) out.push({ id: c.id, name: c.name, isPrivate: c.is_private });
    cursor = body.response_metadata?.next_cursor ?? "";
    if (!cursor) break;
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function postMessage(token: string, channel: string, message: { text: string; blocks: unknown[] }) {
  await call(
    await fetch(`${SLACK}/api/chat.postMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel, ...message, unfurl_links: false, unfurl_media: false }),
    }),
  );
}

// Someone's Slack member ID from their email, or null if Slack has no one
// with it in this workspace.
export async function lookupUserByEmail(token: string, email: string): Promise<string | null> {
  const url = new URL(`${SLACK}/api/users.lookupByEmail`);
  url.searchParams.set("email", email);
  try {
    const body = await call<SlackReply & { user: { id: string } }>(await fetch(url, { headers: { Authorization: `Bearer ${token}` } }));
    return body.user.id;
  } catch (e) {
    if (e instanceof SlackError && e.code === "users_not_found") return null;
    throw e;
  }
}

export interface ListColumn {
  id: string;
  name: string;
  type: string;
  is_primary_column?: boolean;
}

// A List's ID from its link (…slack.com/lists/T…/F…), or an ID given as it is.
export function listIdFrom(link: string): string | null {
  const trimmed = link.trim();
  const match = trimmed.match(/\/lists\/[A-Z0-9]+\/(F[A-Z0-9]{6,20})/) ?? trimmed.match(/^(F[A-Z0-9]{6,20})$/);
  return match ? match[1] : null;
}

// A List's title and columns: from the items call with its list included,
// or, failing that, from its first item's details (where Slack documents
// the shape).
export async function readList(token: string, listId: string): Promise<{ title: string; columns: ListColumn[] }> {
  type ListObj = { title?: string; name?: string; list_metadata?: { schema?: ListColumn[] } };
  const headers = { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` };
  const items = await call<SlackReply & { list?: ListObj; items?: { id: string }[] }>(
    await fetch(`${SLACK}/api/slackLists.items.list`, {
      method: "POST",
      headers,
      body: JSON.stringify({ list_id: listId, include_list: true, limit: 1 }),
    }),
  );
  let list = items.list;
  if (!list?.list_metadata?.schema && items.items?.[0]) {
    const info = await call<SlackReply & { list?: ListObj }>(
      await fetch(`${SLACK}/api/slackLists.items.info`, {
        method: "POST",
        headers,
        body: JSON.stringify({ list_id: listId, id: items.items[0].id }),
      }),
    );
    list = info.list;
  }
  const columns = list?.list_metadata?.schema;
  if (!columns?.length) throw new SlackError("list_columns_unknown");
  return { title: list?.title || list?.name || "List", columns };
}

export async function createListItem(token: string, listId: string, fields: Record<string, unknown>[]) {
  await call(
    await fetch(`${SLACK}/api/slackLists.items.create`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ list_id: listId, initial_fields: fields }),
    }),
  );
}

