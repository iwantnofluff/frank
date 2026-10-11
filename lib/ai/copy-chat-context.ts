// What Draft with Frank reads beyond the post itself (direct instruction):
// the client's other posts, for their voice, and what the client has
// asked for lately. Pure, so the choosing and ordering can be tested; the
// route reads the rows.
import type { ClientFeedback, OtherPost } from "./copy-chat.ts";

export const OTHER_POSTS_MAX = 8;
export const FEEDBACK_MAX = 20;

// How far back each reaches, as a client sets it in Preferences (phase89):
// off, a period, or all time.
export type PostsSetting = "off" | "3m" | "6m" | "12m" | "all";
export type FeedbackSetting = "off" | "30d" | "90d" | "180d" | "all";
const POSTS_MONTHS: Record<string, number> = { "3m": 3, "6m": 6, "12m": 12 };
const FEEDBACK_DAYS: Record<string, number> = { "30d": 30, "90d": 90, "180d": 180 };

// The earliest moment that counts, null for all time (the caller skips
// "off" altogether).
export function postsSince(setting: PostsSetting, now: Date): Date | null {
  const months = POSTS_MONTHS[setting];
  if (!months) return null;
  const d = new Date(now);
  d.setMonth(d.getMonth() - months);
  return d;
}
export function feedbackSince(setting: FeedbackSetting, now: Date): Date | null {
  const days = FEEDBACK_DAYS[setting];
  return days ? new Date(now.getTime() - days * 86_400_000) : null;
}

// In words, for the Draft with Frank window and Preferences.
export function postsReach(setting: PostsSetting): string {
  return setting === "all" ? "from any time" : `from the last ${POSTS_MONTHS[setting]} months`;
}
export function feedbackReach(setting: FeedbackSetting): string {
  return setting === "all" ? "from any time" : `from the last ${FEEDBACK_DAYS[setting]} days`;
}

export interface PostRow {
  id: string;
  name: string;
  stage: number;
  formatLabel: string;
  updated_at: string;
  approved_at: string | null;
  voiceover: string | null;
  slide_text: string[] | null;
}

export interface CopyRow {
  creative_id: string;
  created_at: string;
  fields: Record<string, unknown> | null;
}

// Up to 8 of the client's other posts that have words to go on: Approved
// ones only (direct instruction: never a draft the client hasn't signed
// off), approved since the client's chosen point, newest approval first.
// Each post's latest copy version, its VO and its Text on Image, labelled.
export function pickOtherPosts(
  posts: PostRow[],
  copies: CopyRow[],
  labels: Record<string, string>,
  since: Date | null = null,
): OtherPost[] {
  const latest = new Map<string, CopyRow>();
  for (const c of copies) {
    const had = latest.get(c.creative_id);
    if (!had || c.created_at > had.created_at) latest.set(c.creative_id, c);
  }
  const when = (p: PostRow) => p.approved_at ?? p.updated_at;
  const ordered = posts
    .filter((p) => p.stage === 4 && (!since || new Date(when(p)) >= since))
    .sort((a, b) => when(b).localeCompare(when(a)));
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
    out.push({ name: p.name, approved: true, formatLabel: p.formatLabel, copy });
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
// link) since the client's chosen point, newest first, up to 20, leaving
// out the ones sorted as no issue (praise, approvals). Not yet sorted
// still counts.
export function pickClientFeedback(
  comments: CommentRow[],
  clientUserIds: Set<string>,
  categoryLabels: Record<string, string>,
  since: Date | null,
): ClientFeedback[] {
  return comments
    .filter((c) => (c.guest_name ? true : c.author_id !== null && clientUserIds.has(c.author_id)))
    .filter((c) => c.issue_category !== "no_issue" && c.body.trim() !== "")
    .filter((c) => !since || new Date(c.created_at) >= since)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, FEEDBACK_MAX)
    .map((c) => ({
      post: c.post,
      body: c.body,
      category: c.issue_category ? (categoryLabels[c.issue_category] ?? null) : null,
    }));
}
