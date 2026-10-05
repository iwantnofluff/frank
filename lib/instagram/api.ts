// Server-only. The Instagram API with Instagram Login (phase54), through
// plain fetch, like Paddle and Resend: a handful of endpoints, so no SDK.
// Reading only (instagram_business_basic); publishing is not part of this.
// Endpoints as Meta documents them for Business Login for Instagram.

export class InstagramError extends Error {
  // Instagram's own code: 190 means the token no longer works.
  code: number | undefined;
  constructor(message: string, code?: number) {
    super(message);
    this.code = code;
  }
}

export const isTokenGone = (e: unknown) => e instanceof InstagramError && e.code === 190;

export function appCredentials() {
  const id = process.env.INSTAGRAM_APP_ID;
  const secret = process.env.INSTAGRAM_APP_SECRET;
  if (!id || !secret) throw new Error("Instagram isn't set up yet — INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET are missing.");
  return { id, secret };
}

export const instagramConfigured = () => !!process.env.INSTAGRAM_APP_ID && !!process.env.INSTAGRAM_APP_SECRET;

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const json = (await res.json().catch(() => null)) as
    | (T & { error?: { message?: string; code?: number }; error_message?: string })
    | null;
  if (!res.ok || !json || json.error || json.error_message) {
    throw new InstagramError(
      json?.error?.message ?? json?.error_message ?? `Instagram answered ${res.status}`,
      json?.error?.code,
    );
  }
  return json;
}

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

export function authorizeUrl(redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: appCredentials().id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "instagram_business_basic",
    state,
    // No force_reauth: routing through Instagram's login pages made it
    // refuse the code exchange ("redirect_uri is identical…"). Instagram
    // connects the account the browser is signed into, which the
    // Connections page says.
  });
  return `https://www.instagram.com/oauth/authorize?${q}`;
}

// The sign-in's code for a long-lived token (60 days).
export async function exchangeCode(code: string, redirectUri: string): Promise<{ token: string; expiresAt: Date }> {
  const { id, secret } = appCredentials();
  const short = await call<{ data?: { access_token: string }[]; access_token?: string }>(
    "https://api.instagram.com/oauth/access_token",
    // Multipart form data, as Meta's own examples send it (curl -F).
    { method: "POST", body: formData({ client_id: id, client_secret: secret, grant_type: "authorization_code", redirect_uri: redirectUri, code }) },
  );
  const shortToken = short.data?.[0]?.access_token ?? short.access_token;
  if (!shortToken) throw new InstagramError("Instagram didn't return a token");
  const long = await call<{ access_token: string; expires_in: number }>(
    `https://graph.instagram.com/access_token?${new URLSearchParams({
      grant_type: "ig_exchange_token",
      client_secret: secret,
      access_token: shortToken,
    })}`,
  );
  return { token: long.access_token, expiresAt: new Date(Date.now() + long.expires_in * 1000) };
}

// A fresh 60 days. Only works on a token at least a day old.
export async function refreshToken(token: string): Promise<{ token: string; expiresAt: Date }> {
  const r = await call<{ access_token: string; expires_in: number }>(
    `https://graph.instagram.com/refresh_access_token?${new URLSearchParams({
      grant_type: "ig_refresh_token",
      access_token: token,
    })}`,
  );
  return { token: r.access_token, expiresAt: new Date(Date.now() + r.expires_in * 1000) };
}

export interface InstagramProfile {
  // Scoped to Frank's app; user_id is the professional account's own.
  id?: string;
  user_id: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
  biography?: string;
  website?: string;
  account_type?: string;
}

export function fetchProfile(token: string): Promise<InstagramProfile> {
  return call<InstagramProfile>(
    `https://graph.instagram.com/me?${new URLSearchParams({
      fields:
        "id,user_id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography,website,account_type",
      access_token: token,
    })}`,
  );
}

export interface InstagramMedia {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  // "REELS" for a Reel, "FEED" for a regular post.
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
}

// One page of posts, newest first, and the cursor for the next (null at
// the account's first post).
export async function fetchMedia(
  token: string,
  limit = 30,
  after?: string | null,
): Promise<{ media: InstagramMedia[]; next: string | null }> {
  const q = new URLSearchParams({
    fields: "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp",
    limit: String(limit),
    access_token: token,
  });
  if (after) q.set("after", after);
  const r = await call<{ data: InstagramMedia[]; paging?: { next?: string; cursors?: { after?: string } } }>(
    `https://graph.instagram.com/me/media?${q}`,
  );
  return { media: r.data, next: r.paging?.next && r.paging.cursors?.after ? r.paging.cursors.after : null };
}
