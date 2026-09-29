// Fire-and-forget trigger for app/api/ai/classify-comment/route.ts, called
// from every comment-creation path (hooks/use-create-comment.ts,
// hooks/use-shared-actions.ts) right after a comment lands. Never awaited
// by its caller and never surfaced to the UI — classification is
// best-effort advisory data, not something a comment's own success should
// ever wait on or fail because of.
export function classifyComment(commentId: string): void {
  fetch("/api/ai/classify-comment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commentId }),
  }).catch(() => {
    // Best-effort — a failed classification just leaves issue_category
    // null, the same as one that was never attempted.
  });
}
