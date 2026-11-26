// What a Table's link is copied as (direct instruction, 26 Nov 2026), as the
// review link's are (lib/review-message.ts): the link alone, or in one of
// two messages. Plain text, for email, WhatsApp or Slack. Unlike a review
// link, the Table is for clients who sign in, so both messages say to log
// in. Worded as asked (26 Nov 2026), filled in from what the link opens on:
// its month, and concepts or posts by the statuses picked, one or several.

export type TableMessageKind = "instructions" | "review" | "link";

export function tableMessage({
  kind,
  projectName,
  planner,
  link,
  month = null,
  conceptsOnly = false,
  count = 2,
  feedbackColumn = "Client Feedback",
}: {
  kind: TableMessageKind;
  projectName: string;
  // A Content Planner (scheduled) or a project of another kind.
  planner: boolean;
  link: string;
  // The month it opens on, short ("Dec"); none for whatever month it's
  // opened in.
  month?: string | null;
  // Only Concept (or Idea) picked: "concepts", else posts (or assets).
  conceptsOnly?: boolean;
  // How many it shows: one is worded as one.
  count?: number;
  // The Client Feedback column, by the project's own name for it.
  feedbackColumn?: string;
}): string {
  if (kind === "link") return link;
  const one = count === 1;
  const noun = conceptsOnly ? "concept" : planner ? "post" : "asset";
  const what = planner ? "content planner" : "project";
  const headline = `Your ${month ? `${month} ` : ""}${noun}${one ? "" : "s"} for ${projectName} ${one ? "is" : "are"} ready for review:`;
  const opening = ["Hello,", "", headline, "", link, ""];
  const ending = ["", "Any questions? Just reply here."];
  if (kind === "review") {
    return [
      ...opening,
      `Log in to comment directly in the table, in the ${feedbackColumn} column, or open ${one ? "the post" : "any post"} to see it in full.`,
      ...ending,
    ].join("\n");
  }
  const steps = [
    "Open the link.",
    "Log in with the email we invited you with.",
    `Directly comment in the table, in the ${feedbackColumn} column, or`,
    `Open ${one ? "the post" : "any post"} in the ${what} to see it in full. Pause a video to comment on a specific moment.`,
  ];
  return [
    ...opening,
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    "No login yet? Reply here and we’ll send you an invite.",
    ...ending,
  ].join("\n");
}
