// What a Table's link is copied as (direct instruction, 26 Nov 2026), as the
// review link's are (lib/review-message.ts): the link alone, or in one of
// two messages. Plain text, for email, WhatsApp or Slack. Unlike a review
// link, the Table is for clients who sign in, so both messages say to log
// in; and a signed-in client comments but doesn't approve, so neither
// mentions Approve.

export type TableMessageKind = "instructions" | "review" | "link";

export function tableMessage({
  kind,
  projectName,
  planner,
  link,
}: {
  kind: TableMessageKind;
  projectName: string;
  // A Content Planner (scheduled) or a project of another kind.
  planner: boolean;
  link: string;
}): string {
  if (kind === "link") return link;
  const what = planner ? "content planner" : "project";
  const opening = ["Hello,", "", `Your ${what} "${projectName}" is ready for review:`, "", link, ""];
  const ending = ["", "Any questions? Just reply here."];
  if (kind === "review") {
    return [...opening, "Log in to see everything planned, and comment directly on any post you’d like changed.", ...ending].join("\n");
  }
  const steps = [
    "Open the link.",
    "Log in with the email we invited you with.",
    `Open any post in the ${what} to see it in full.`,
    "Comment directly on anything you’d like changed. You can pause a video to comment on a specific moment.",
  ];
  return [
    ...opening,
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    "No login yet? Reply here and we’ll send you an invite.",
    ...ending,
  ].join("\n");
}
