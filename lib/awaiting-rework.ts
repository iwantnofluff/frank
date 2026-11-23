// A post whose client feedback is still to be worked on (direct
// instruction): the client's latest comment is newer than the post's latest
// version of anything the client reviews (artwork, copy, VO, Text on Image,
// a thumbnail). A review link leaves such a post out of Also waiting for
// your review, and the share window doesn't count it. Compared as times:
// Postgres's JSON and PostgREST can write the same moment differently.
export const REWORK_VERSION_TABLES = ["creative_versions", "copy_versions", "production_versions", "thumbnail_versions"] as const;

export function awaitingRework(lastClientCommentAt: string | null | undefined, lastVersionAt: string | null | undefined): boolean {
  if (!lastClientCommentAt) return false;
  if (!lastVersionAt) return true;
  return Date.parse(lastClientCommentAt) > Date.parse(lastVersionAt);
}

// Each post's latest version time, from rows of the tables above.
export function latestByCreative(rows: { creative_id: string; created_at: string }[]): Map<string, string> {
  const latest = new Map<string, string>();
  for (const r of rows) {
    const had = latest.get(r.creative_id);
    if (!had || Date.parse(r.created_at) > Date.parse(had)) latest.set(r.creative_id, r.created_at);
  }
  return latest;
}
