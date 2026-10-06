// An Approved post's artwork goes 7 days after its live date (phase60,
// run_artwork_housekeeping); these say when, for the post's warning.
const DAY_MS = 86_400_000;
export const ARTWORK_KEEP_DAYS = 7;

// When an Approved, dated post's artwork will be removed; null for any
// other post (still in review, or with no live date).
export function artworkRemovalDate(post: { stage: number; scheduled_at: string | null }): Date | null {
  if (post.stage !== 4 || !post.scheduled_at) return null;
  return new Date(new Date(post.scheduled_at).getTime() + ARTWORK_KEEP_DAYS * DAY_MS);
}

export function dayMonth(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
