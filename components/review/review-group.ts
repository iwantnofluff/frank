import type { SharedCreative } from "@/hooks/use-shared-review";

// Where a post sits in a review link's list (direct instruction): what the
// client still has to look at first, then what they've commented on, then
// what's approved.
export type ReviewGroup = "to_review" | "commented" | "approved";

export function reviewGroup(c: SharedCreative): ReviewGroup {
  if (c.stage >= 4) return "approved";
  return c.comments.some((m) => m.from_client) ? "commented" : "to_review";
}

// How far back the list's Approved goes (direct instruction: a project's
// approved posts would make the list too long after a while): the
// workspace's choice in Preferences (phase92), null for Always, 14 by
// default. A post this link was made for stays, however long ago it was
// approved, and so does one with no approval date to judge by.
export const DEFAULT_APPROVED_DAYS = 14;

export interface ReviewSection {
  id: "sent" | "also" | "waiting" | "approved";
  label: string;
  items: SharedCreative[];
}

// The list's sections, one level of heading (direct instruction): a link
// made for particular posts has Sent for review, then Also waiting for your
// review (the project's other posts in Client Review, phase69); a link to
// the whole project has Waiting for your review. Each lists what's still to
// review before what the client has commented on. Approved comes last,
// newest first, only the last approvedDays (all of them when null). Empty sections are left
// out. The page steps through posts in this order.
export function reviewSections(
  all: SharedCreative[],
  sentIds: Set<string>,
  now: number,
  approvedDays: number | null = DEFAULT_APPROVED_DAYS,
): ReviewSection[] {
  const toReviewFirst = (list: SharedCreative[]) => [
    ...list.filter((c) => reviewGroup(c) === "to_review"),
    ...list.filter((c) => reviewGroup(c) === "commented"),
  ];
  const inReview = all.filter((c) => c.stage < 4);
  const cutoff = approvedDays === null ? -Infinity : now - approvedDays * 86_400_000;
  const approved = all
    .filter((c) => c.stage >= 4 && (sentIds.has(c.id) || c.approved_at === null || Date.parse(c.approved_at) >= cutoff))
    .sort((a, b) => (b.approved_at ?? "").localeCompare(a.approved_at ?? ""));
  const sections: ReviewSection[] = sentIds.size
    ? [
        { id: "sent", label: "Sent for review", items: toReviewFirst(inReview.filter((c) => sentIds.has(c.id))) },
        { id: "also", label: "Also waiting for your review", items: toReviewFirst(inReview.filter((c) => !sentIds.has(c.id))) },
      ]
    : [{ id: "waiting", label: "Waiting for your review", items: toReviewFirst(inReview) }];
  sections.push({ id: "approved", label: "Approved", items: approved });
  return sections.filter((s) => s.items.length);
}
