"use client";

import type { SharedCreative } from "@/hooks/use-shared-review";
import type { ReviewController } from "@/hooks/use-review-controller";
import { commentTime, formatVideoTime } from "@/lib/annotations";

// On the review link, a comment made at a moment in the video shows it
// ("0:12"); clicking goes to that moment.
export function MomentBadge({
  comment,
  controller,
}: {
  comment: SharedCreative["comments"][number];
  controller: ReviewController;
}) {
  const t = commentTime(comment.anchor);
  if (t === null) return null;
  return (
    <button
      type="button"
      className="anchor time-a"
      aria-label={`Go to ${formatVideoTime(t)}`}
      onClick={() => controller.selectComment(comment.id, t, (comment.anchor as { slide?: number } | null)?.slide)}
    >
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      {formatVideoTime(t)}
    </button>
  );
}
