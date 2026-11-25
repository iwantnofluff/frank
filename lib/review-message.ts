// What a review link is copied as: the link alone, or in one of two messages (direct instruction, 24 Nov
// 2026): both always offered, the person sharing picks. Plain text, for
// email, WhatsApp or Slack. Approve is only mentioned when the link lets
// the client approve. Highlighting copy isn't mentioned: on a link a client
// can pause a video to comment on a moment, not pick words.

export type ReviewMessageKind = "link" | "instructions" | "request";

export function reviewMessage({
  kind,
  postName,
  others,
  link,
  canApprove,
}: {
  kind: ReviewMessageKind;
  // A post the link is for, by name, even when it's for several (direct
  // instruction, 25 Nov 2026: it named the project then); others says
  // there are more.
  postName: string;
  others: boolean;
  link: string;
  canApprove: boolean;
}): string {
  if (kind === "link") return link;
  // The user's own structure for both (24 Nov 2026): which post, in quotes,
  // and the link on a line of its own.
  const ready = others ? `The post "${postName}", and others are ready for review:` : `The post "${postName}" is ready for review:`;
  const opening = ["Hello,", "", ready, "", link, ""];
  if (kind === "request") {
    return [
      ...opening,
      canApprove
        ? "Comment directly on anything you’d like changed, or hit Approve if you’re happy."
        : "Comment directly on anything you’d like changed.",
      "",
      "Any questions? Just reply here.",
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
    "Want to see your full content planner? Create a login using the same link. Optional.",
    "",
    "Any questions? Just reply here.",
  ].join("\n");
}
