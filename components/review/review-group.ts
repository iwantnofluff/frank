import type { SharedCreative } from "@/hooks/use-shared-review";

// Where a post sits in a review link's list (direct instruction): what the
// client still has to look at first, then what they've commented on, then
// what's approved.
export type ReviewGroup = "to_review" | "commented" | "approved";

export const REVIEW_GROUPS: { id: ReviewGroup; label: string }[] = [
  { id: "to_review", label: "To review" },
  { id: "commented", label: "Commented" },
  { id: "approved", label: "Approved" },
];

export function reviewGroup(c: SharedCreative): ReviewGroup {
  if (c.stage >= 4) return "approved";
  return c.comments.some((m) => m.from_client) ? "commented" : "to_review";
}
