import type { SupabaseClient } from "@supabase/supabase-js";
import { tenantFromHost } from "@/lib/tenant";
import { decryptToken, encryptToken } from "./secrets";
import { fetchMedia, fetchProfile, isTokenGone, refreshToken, type InstagramMedia, type InstagramProfile } from "./api";

// Server-only, with the service role (phase54): the token table has no
// policies, so nothing else can read it.

// The address a request actually came in on, from its Host header (as the
// admin area's agencyOrigin does): request.url can read localhost in
// development, whatever address was used.
export function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

// Instagram sends people back to one fixed address per environment (Meta
// accepts no wildcards): the environment's root (beingfrank.app,
// staging.beingfrank.app, frank.localhost locally). Worked out from the
// address the request came in on, an agency's (its first label dropped) or
// the root's own, so each environment points at itself.
export function callbackUrl(request: Request): string {
  const origin = new URL(requestOrigin(request));
  const host =
    tenantFromHost(origin.host).kind === "agency" ? origin.host.split(".").slice(1).join(".") : origin.host;
  return `${origin.protocol}//${host}/api/connections/instagram/callback`;
}

export async function saveConnection(
  admin: SupabaseClient,
  input: { clientId: string; profile: InstagramProfile; token: string; expiresAt: Date; connectedByName: string },
): Promise<string> {
  const { data: conn, error } = await admin
    .from("instagram_connections")
    .upsert(
      {
        client_id: input.clientId,
        ig_user_id: input.profile.user_id,
        ig_scoped_id: input.profile.id ?? null,
        username: input.profile.username,
        name: input.profile.name ?? null,
        profile_picture_url: input.profile.profile_picture_url ?? null,
        followers_count: input.profile.followers_count ?? null,
        media_count: input.profile.media_count ?? null,
        connected_by_name: input.connectedByName,
        connected_at: new Date().toISOString(),
        needs_reconnect_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "client_id" },
    )
    .select("id")
    .single();
  if (error || !conn) throw new Error(error?.message ?? "Couldn't save the connection");
  const { error: tokenError } = await admin.from("instagram_tokens").upsert({
    connection_id: conn.id,
    token_encrypted: encryptToken(input.token),
    expires_at: input.expiresAt.toISOString(),
    refreshed_at: new Date().toISOString(),
  });
  if (tokenError) throw new Error(tokenError.message);
  clearFeedCache(input.clientId);
  return conn.id as string;
}

const DAY = 24 * 3600_000;

// The connection's token, renewed first if it ends within a week (and is
// old enough for Instagram to renew).
async function usableToken(admin: SupabaseClient, connectionId: string): Promise<string | null> {
  const { data: row } = await admin
    .from("instagram_tokens")
    .select("token_encrypted, expires_at, refreshed_at")
    .eq("connection_id", connectionId)
    .maybeSingle();
  if (!row) return null;
  let token = decryptToken(row.token_encrypted as string);
  const expires = new Date(row.expires_at as string).getTime();
  const refreshed = new Date(row.refreshed_at as string).getTime();
  if (expires - Date.now() < 7 * DAY && Date.now() - refreshed > DAY) {
    const fresh = await refreshToken(token);
    token = fresh.token;
    await admin
      .from("instagram_tokens")
      .update({
        token_encrypted: encryptToken(token),
        expires_at: fresh.expiresAt.toISOString(),
        refreshed_at: new Date().toISOString(),
      })
      .eq("connection_id", connectionId);
  }
  return token;
}

export interface LiveFeed {
  profile: {
    username: string;
    name: string | null;
    pictureUrl: string | null;
    followers: number | null;
    following: number | null;
    posts: number | null;
    // The header's description and link, as on the profile.
    bio: string | null;
    website: string | null;
  };
  posts: {
    id: string;
    imageUrl: string | null;
    permalink: string;
    caption: string | null;
    kind: string;
    // For the Reels tab.
    reel: boolean;
    at: string;
  }[];
  // Where the next page starts; null once the account's first post is in.
  next: string | null;
}

// Ten minutes per page per client: scrolling the Feed Preview doesn't call
// Instagram each time (it allows 200 calls an hour per account). Per
// server instance.
const feedCache = new Map<string, { at: number; feed: LiveFeed }>();
const CACHE_MS = 10 * 60_000;
const PAGE = 30;

export type FeedResult =
  | { status: "ok"; feed: LiveFeed }
  | { status: "not_connected" }
  | { status: "needs_reconnect"; username: string }
  | { status: "error"; message: string };

const toPost = (m: InstagramMedia) => ({
  id: m.id,
  // A video's cover, not the video.
  imageUrl: (m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url) ?? null,
  permalink: m.permalink,
  caption: m.caption ?? null,
  kind: m.media_type,
  reel: m.media_product_type === "REELS",
  at: m.timestamp,
});

// The first page (after: none) with a fresh profile, or a later page with
// the profile as last stored, so scrolling costs one Instagram call a page.
export async function liveFeed(admin: SupabaseClient, clientId: string, after?: string | null): Promise<FeedResult> {
  // The connection first, so a disconnected or removed account stops
  // showing at once rather than when its cache runs out.
  const { data: conn } = await admin
    .from("instagram_connections")
    .select("id, username, name, profile_picture_url, followers_count, media_count, needs_reconnect_at")
    .eq("client_id", clientId)
    .maybeSingle();
  if (!conn) return { status: "not_connected" };
  if (conn.needs_reconnect_at) return { status: "needs_reconnect", username: conn.username as string };
  const cacheKey = `${clientId}:${after ?? ""}`;
  const cached = feedCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_MS) return { status: "ok", feed: cached.feed };

  try {
    const token = await usableToken(admin, conn.id as string);
    if (!token) return { status: "not_connected" };
    let profile: LiveFeed["profile"] = {
      username: conn.username as string,
      name: (conn.name as string | null) ?? null,
      pictureUrl: (conn.profile_picture_url as string | null) ?? null,
      followers: (conn.followers_count as number | null) ?? null,
      following: null,
      posts: (conn.media_count as number | null) ?? null,
      bio: null,
      website: null,
    };
    let page: { media: InstagramMedia[]; next: string | null };
    if (after) {
      page = await fetchMedia(token, PAGE, after);
    } else {
      const [fresh, first] = await Promise.all([fetchProfile(token), fetchMedia(token, PAGE)]);
      page = first;
      profile = {
        username: fresh.username,
        name: fresh.name ?? null,
        pictureUrl: fresh.profile_picture_url ?? null,
        followers: fresh.followers_count ?? null,
        following: fresh.follows_count ?? null,
        posts: fresh.media_count ?? null,
        bio: fresh.biography?.trim() || null,
        website: fresh.website?.trim() || null,
      };
      // Keep the header's details current.
      await admin
        .from("instagram_connections")
        .update({
          username: fresh.username,
          name: fresh.name ?? null,
          profile_picture_url: fresh.profile_picture_url ?? null,
          followers_count: fresh.followers_count ?? null,
          media_count: fresh.media_count ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", conn.id);
    }
    const feed: LiveFeed = { profile, posts: page.media.map(toPost), next: page.next };
    feedCache.set(cacheKey, { at: Date.now(), feed });
    return { status: "ok", feed };
  } catch (e) {
    if (isTokenGone(e)) {
      await admin.from("instagram_connections").update({ needs_reconnect_at: new Date().toISOString() }).eq("id", conn.id);
      return { status: "needs_reconnect", username: conn.username as string };
    }
    return { status: "error", message: (e as Error).message };
  }
}

// Everything Frank holds for an Instagram account (Meta's deauthorize and
// data deletion callbacks name it by either of its IDs). The token goes
// with its connection.
export async function forgetInstagramUser(admin: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await admin
    .from("instagram_connections")
    .delete()
    .or(`ig_user_id.eq.${userId},ig_scoped_id.eq.${userId}`)
    .select("client_id");
  if (error) throw new Error(error.message);
  for (const row of data ?? []) clearFeedCache(row.client_id as string);
  return (data ?? []).length;
}

function clearFeedCache(clientId: string) {
  for (const key of feedCache.keys()) if (key.startsWith(`${clientId}:`)) feedCache.delete(key);
}
