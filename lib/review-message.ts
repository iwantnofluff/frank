// The two messages a review link is copied with (direct instruction, 24 Nov
// 2026): both always offered, the person sharing picks. Plain text, for
// email, WhatsApp or Slack. Approve is only mentioned when the link lets
// the client approve. Highlighting copy isn't mentioned: on a link a client
// can pause a video to comment on a moment, not pick words.

export type ReviewMessageKind = "instructions" | "request";

export function reviewMessage({
  kind,
  title,
  link,
  canApprove,
}: {
  kind: ReviewMessageKind;
  // The post, or the project when the link is for several (as the link is named).
  title: string;
  link: string;
  canApprove: boolean;
}): string {
  const opening = ["Hello,", "", `${title} is ready for review: ${link}`, ""];
  const closing = ["Any questions, just reply here."];
  if (kind === "request") {
    return [
      ...opening,
      canApprove
        ? "Comment directly on anything you’d like changed, or hit Approve if you’re happy."
        : "Comment directly on anything you’d like changed.",
      "",
      ...closing,
    ].join("\n");
  }
  const steps = [
    "Open the link.",
    "Pick your name.",
    "Scroll down to comment. You can pause a video to comment on a specific moment.",
    ...(canApprove ? ["Hit Approve if you’re happy."] : []),
  ];
  return [
    ...opening,
    "No account needed.",
    "",
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    "Want to see your full content planner? Create a login from the same link. Optional.",
    "",
    ...closing,
  ].join("\n");
}
