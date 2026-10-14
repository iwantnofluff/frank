import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchMedia, isTokenGone, type InstagramMedia } from "./api";
import { usableToken } from "./store";
import { EARLIEST_DAYS, LATEST_DAYS, matchLivePosts, type ScheduledPost } from "@/lib/live-match";

// The nightly look for posts that went live (phase98, decided directly):
// for each client with a working Instagram connection, its recent posts on
// Instagram against Frank's scheduled Instagram posts not yet found, by
// caption (lib/live-match.ts). Each found is logged in post_live_dates
// with when it went live and when it was due, for Analytics, and moves to
// 5. Live (phase99), its agency's Owners and Admins told if it wasn't yet
// Approved. A post set Live by hand is still looked for, so Instagram's
// time replaces the hand-set one. A connection that fails is noted and
// skipped.

const DAY = 86_400_000;
const IG_FORMATS = ["ig_feed", "ig_carousel", "ig_reel"];
// How far back a scheduled post is still looked for: as late as a match
// can be, and as far back as the Instagram posts read reach.
const LOOK_BACK_DAYS = 60;
const PAGE = 50;
const MAX_PAGES = 4;

export interface LiveDatesRun {
  accounts: number;
  logged: number;
  // Of those, moved to Live by this run.
  moved: number;
  failed: number;
}

// Every agency's, or one's (the tests', as run_artwork_housekeeping takes).
export async function logLiveDates(admin: SupabaseClient, agencyId?: string): Promise<LiveDatesRun> {
  const run: LiveDatesRun = { accounts: 0, logged: 0, moved: 0, failed: 0 };
  let q = admin.from("instagram_connections").select("id, client_id").is("needs_reconnect_at", null);
  if (agencyId) q = q.eq("agency_id", agencyId);
  const { data: conns, error } = await q;
  if (error) throw new Error(error.message);

  const since = Date.now() - LOOK_BACK_DAYS * DAY;
  for (const conn of conns ?? []) {
    run.accounts++;
    try {
      const posts = await candidatePosts(admin, conn.client_id as string, since);
      if (!posts.length) continue;
      const token = await usableToken(admin, conn.id as string);
      if (!token) continue;
      const media = await recentMedia(token, since - LATEST_DAYS * DAY);
      const { data: taken } = await admin
        .from("post_live_dates")
        .select("instagram_media_id")
        .in("instagram_media_id", media.map((m) => m.id));
      const takenIds = new Set((taken ?? []).map((t) => t.instagram_media_id as string));
      const matches = matchLivePosts(
        posts,
        media
          .filter((m) => !takenIds.has(m.id))
          .map((m) => ({
            id: m.id,
            caption: m.caption ?? null,
            mediaType: m.media_type,
            productType: m.media_product_type ?? null,
            timestamp: m.timestamp,
            permalink: m.permalink ?? null,
          })),
      );
      if (!matches.length) continue;
      const { data: written, error: writeError } = await admin
        .from("post_live_dates")
        .upsert(
          matches.map((m) => ({
            creative_id: m.postId,
            instagram_media_id: m.mediaId,
            permalink: m.permalink,
            live_at: m.liveAt,
            scheduled_at: m.scheduledAt,
            source: "instagram",
          })),
          // A hand-set date gives way to Instagram's (candidatePosts
          // leaves out any already found on Instagram).
          { onConflict: "creative_id" },
        )
        .select("creative_id");
      if (writeError) throw new Error(writeError.message);
      run.logged += written?.length ?? 0;
      const { data: moved, error: moveError } = await admin.rpc("mark_posts_live", {
        p_creative_ids: matches.map((m) => m.postId),
      });
      if (moveError) throw new Error(moveError.message);
      run.moved += (moved as number | null) ?? 0;
    } catch (e) {
      run.failed++;
      if (isTokenGone(e)) {
        await admin.from("instagram_connections").update({ needs_reconnect_at: new Date().toISOString() }).eq("id", conn.id);
      }
      console.error("Live dates: an Instagram account failed", conn.id, (e as Error).message);
    }
  }
  return run;
}

// The client's scheduled Instagram posts from the last two months (or due
// within two days), not archived, not yet found, with the caption of their
// latest copy.
async function candidatePosts(admin: SupabaseClient, clientId: string, since: number): Promise<ScheduledPost[]> {
  const { data: rows, error } = await admin
    .from("creatives")
    .select("id, formats, scheduled_at, projects!inner(client_id), post_live_dates(source)")
    .eq("projects.client_id", clientId)
    .is("archived_at", null)
    .not("scheduled_at", "is", null)
    .gte("scheduled_at", new Date(since).toISOString())
    .lte("scheduled_at", new Date(Date.now() + EARLIEST_DAYS * DAY).toISOString())
    .overlaps("formats", IG_FORMATS);
  if (error) throw new Error(error.message);
  // Not yet found on Instagram (a date set by hand doesn't count). One
  // row a post, so the embed is an object or null.
  const found = (r: { post_live_dates: unknown }) => {
    const l = r.post_live_dates as { source: string } | { source: string }[] | null;
    return (Array.isArray(l) ? l : l ? [l] : []).some((x) => x.source === "instagram");
  };
  const open = (rows ?? []).filter((r) => !found(r));
  if (!open.length) return [];
  const { data: copies, error: copyError } = await admin
    .from("copy_versions")
    .select("creative_id, version_no, fields")
    .in("creative_id", open.map((r) => r.id as string))
    .order("version_no", { ascending: false });
  if (copyError) throw new Error(copyError.message);
  const caption = new Map<string, string>();
  for (const c of copies ?? []) {
    const id = c.creative_id as string;
    if (!caption.has(id)) caption.set(id, ((c.fields as Record<string, unknown> | null)?.caption as string | undefined) ?? "");
  }
  return open
    .filter((r) => caption.get(r.id as string)?.trim())
    .map((r) => ({
      id: r.id as string,
      formats: (r.formats as string[] | null) ?? [],
      scheduledAt: r.scheduled_at as string,
      caption: caption.get(r.id as string)!,
    }));
}

// The account's posts back to `until`, newest first, a few pages at most.
async function recentMedia(token: string, until: number): Promise<InstagramMedia[]> {
  const out: InstagramMedia[] = [];
  let after: string | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const page = await fetchMedia(token, PAGE, after);
    out.push(...page.media);
    const oldest = page.media.at(-1);
    if (!page.next || !oldest || Date.parse(oldest.timestamp) < until) break;
    after = page.next;
  }
  return out;
}
