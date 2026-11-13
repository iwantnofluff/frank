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
// them (phase155). The List permissions are from phase155's Lists, set
// aside (phase156); asked for still so connected workspaces needn't
// reconnect again.
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

// Posts a message, into a thread if given its header's ts; returns the new
// message's own ts (a thread's, for its header).
export async function postMessage(token: string, channel: string, message: { text: string; blocks: unknown[]; thread_ts?: string }) {
  const body = await call<SlackReply & { ts: string }>(
    await fetch(`${SLACK}/api/chat.postMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel, ...message, unfurl_links: false, unfurl_media: false }),
    }),
  );
  return body.ts;
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
