// An Approved post's artwork goes some days after its live date: 7 unless
// its client's Preferences say 14, 21 or 28 (phase60, then phase70,
// run_artwork_housekeeping); these say when, for the post's warning.
const DAY_MS = 86_400_000;
export const ARTWORK_KEEP_DAYS = 7;

// When an Approved, dated post's artwork will be removed; null for any
// other post (still in review, or with no live date).
export function artworkRemovalDate(
  post: { stage: number; scheduled_at: string | null },
  keepDays: number = ARTWORK_KEEP_DAYS,
): Date | null {
  if (post.stage !== 4 || !post.scheduled_at) return null;
  return new Date(new Date(post.scheduled_at).getTime() + keepDays * DAY_MS);
}

export function dayMonth(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
