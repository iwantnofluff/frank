// What Draft with Frank reads beyond the post itself (direct instruction):
// the client's other posts, for their voice, and what the client has
// asked for lately. Pure, so the choosing and ordering can be tested; the
// route reads the rows.
import type { ClientFeedback, OtherPost } from "./copy-chat.ts";

export const OTHER_POSTS_MAX = 8;
export const FEEDBACK_MAX = 20;
export const FEEDBACK_DAYS = 90;

export interface PostRow {
  id: string;
  name: string;
  stage: number;
  formatLabel: string;
  updated_at: string;
  voiceover: string | null;
  slide_text: string[] | null;
}

export interface CopyRow {
  creative_id: string;
  created_at: string;
  fields: Record<string, unknown> | null;
}

// Up to 8 of the client's other posts that have words to go on: Approved
// first, then the rest, newest first within each. Each post's latest copy
// version, its VO and its Text on Image, labelled.
export function pickOtherPosts(posts: PostRow[], copies: CopyRow[], labels: Record<string, string>): OtherPost[] {
  const latest = new Map<string, CopyRow>();
  for (const c of copies) {
    const had = latest.get(c.creative_id);
    if (!had || c.created_at > had.created_at) latest.set(c.creative_id, c);
  }
  const ordered = [...posts].sort(
    (a, b) => Number(b.stage === 4) - Number(a.stage === 4) || b.updated_at.localeCompare(a.updated_at),
  );
  const out: OtherPost[] = [];
  for (const p of ordered) {
    const fields = latest.get(p.id)?.fields ?? {};
    const copy = Object.entries(fields)
      .filter((e): e is [string, string] => typeof e[1] === "string" && e[1].trim() !== "")
      .map(([key, text]) => ({ label: labels[key] ?? key, text }));
    if (p.voiceover?.trim()) copy.push({ label: "VO", text: p.voiceover });
    const onImage = (p.slide_text ?? []).filter((t) => t.trim());
    if (onImage.length) copy.push({ label: "Text on Image", text: onImage.join(" / ") });
    if (!copy.length) continue;
    out.push({ name: p.name, approved: p.stage === 4, formatLabel: p.formatLabel, copy });
    if (out.length === OTHER_POSTS_MAX) break;
  }
  return out;
}

export interface CommentRow {
  body: string;
  created_at: string;
  author_id: string | null;
  guest_name: string | null;
  issue_category: string | null;
  post: string;
}

// The client's own comments (their people in Frank, or guests on a review
// link) from the last 90 days, newest first, up to 20, leaving out the
// ones sorted as no issue (praise, approvals). Not yet sorted still counts.
export function pickClientFeedback(
  comments: CommentRow[],
  clientUserIds: Set<string>,
  categoryLabels: Record<string, string>,
  now: Date,
): ClientFeedback[] {
  const since = now.getTime() - FEEDBACK_DAYS * 86_400_000;
  return comments
    .filter((c) => (c.guest_name ? true : c.author_id !== null && clientUserIds.has(c.author_id)))
    .filter((c) => c.issue_category !== "no_issue" && c.body.trim() !== "")
    .filter((c) => new Date(c.created_at).getTime() >= since)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, FEEDBACK_MAX)
    .map((c) => ({
      post: c.post,
      body: c.body,
      category: c.issue_category ? (categoryLabels[c.issue_category] ?? null) : null,
    }));
}
