// Finding a scheduled post on its client's Instagram (phase98, decided
// directly): by its caption, strictly, since nobody confirms a match and a
// wrong one would put a false date into Analytics. Its kind has to fit
// (a Reel to a Reel), and Instagram's publish time has to fall from two
// days before its live date to thirty after.

export interface ScheduledPost {
  id: string;
  formats: string[];
  scheduledAt: string;
  caption: string;
}

export interface LiveMedia {
  id: string;
  caption: string | null;
  mediaType: string; // IMAGE | VIDEO | CAROUSEL_ALBUM
  productType: string | null; // FEED | REELS
  timestamp: string;
  permalink: string | null;
}

export interface LiveMatch {
  postId: string;
  mediaId: string;
  permalink: string | null;
  liveAt: string;
  scheduledAt: string;
}

const DAY = 86_400_000;
export const EARLIEST_DAYS = 2;
export const LATEST_DAYS = 30;
// The shortest caption matched loosely; below it, only the same words.
const LOOSE_FROM = 40;
const LOOSE_AT = 0.97;

// The same words, whatever the spacing, line breaks, letter case or
// invisible characters Instagram or a phone added.
export function normalizeCaption(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[​-‍⁠﻿]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function bigrams(s: string): Map<string, number> {
  const out = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

// How alike two captions are, 0 to 1 (Dice on letter pairs).
export function captionLikeness(a: string, b: string): number {
  const x = bigrams(a);
  const y = bigrams(b);
  let shared = 0;
  for (const [g, n] of x) shared += Math.min(n, y.get(g) ?? 0);
  const total = Math.max(a.length - 1, 0) + Math.max(b.length - 1, 0);
  return total ? (2 * shared) / total : 0;
}

// The same caption: identical once tidied, or, for a long one, all but a
// character or two (a typo fixed, an emoji added).
export function sameCaption(planned: string, live: string): boolean {
  const a = normalizeCaption(planned);
  const b = normalizeCaption(live);
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.min(a.length, b.length) < LOOSE_FROM) return false;
  if (Math.min(a.length, b.length) / Math.max(a.length, b.length) < LOOSE_AT) return false;
  return captionLikeness(a, b) >= LOOSE_AT;
}

// Its Instagram formats the media could be: a Reel only a Reel, a
// carousel only a carousel, a feed post only a single picture or video.
export function kindFits(formats: string[], m: Pick<LiveMedia, "mediaType" | "productType">): boolean {
  if (m.productType === "REELS") return formats.includes("ig_reel");
  if (m.mediaType === "CAROUSEL_ALBUM") return formats.includes("ig_carousel");
  return formats.includes("ig_feed");
}

export function inWindow(scheduledAt: string, liveAt: string): boolean {
  const s = Date.parse(scheduledAt);
  const l = Date.parse(liveAt);
  return l >= s - EARLIEST_DAYS * DAY && l <= s + LATEST_DAYS * DAY;
}

// Each Instagram post to at most one of Frank's, and each of Frank's to at
// most one Instagram post. Anything that could be either of two is left
// alone, rather than guessed.
export function matchLivePosts(posts: ScheduledPost[], media: LiveMedia[]): LiveMatch[] {
  const fits = (p: ScheduledPost, m: LiveMedia) =>
    !!m.caption && kindFits(p.formats, m) && inWindow(p.scheduledAt, m.timestamp) && sameCaption(p.caption, m.caption);
  const out: LiveMatch[] = [];
  for (const p of posts) {
    const candidates = media.filter((m) => fits(p, m));
    if (candidates.length !== 1) continue;
    const m = candidates[0];
    if (posts.filter((q) => fits(q, m)).length !== 1) continue;
    out.push({ postId: p.id, mediaId: m.id, permalink: m.permalink, liveAt: m.timestamp, scheduledAt: p.scheduledAt });
  }
  return out;
}
