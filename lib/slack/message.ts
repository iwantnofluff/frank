// What Frank posts to a project's channel (phase154, direct instruction):
// who did what on which post, the words, and a button to the post in Frank.
// Pure, so it's tested on its own (message.test.ts).

export type SlackKind = "client_comment" | "changes_requested" | "client_approval" | "team_comment";

export interface SlackEvent {
  kind: SlackKind;
  // "Priya Shah (Casa Carigar)", "The client, via Raj Rana (WhatsApp)".
  who: string;
  postName: string;
  projectName: string;
  clientName: string | null;
  body: string | null;
  isPrivate: boolean;
  url: string;
  // Who the comment mentions: tagged where Slack knows them by their email
  // (phase155), their name otherwise.
  mentions?: { name: string; slackId: string | null }[];
}

const tag = (m: { name: string; slackId: string | null }) => (m.slackId ? `<@${m.slackId}>` : escapeSlack(m.name));

// Slack reads &, < and > as its own markup.
export const escapeSlack = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const MAX_WORDS = 1500;

const VERB: Record<SlackKind, string> = {
  client_comment: "commented on",
  changes_requested: "asked for changes on",
  client_approval: "approved",
  team_comment: "commented on",
};

export function slackMessage(e: SlackEvent): { text: string; blocks: unknown[] } {
  const headline = `*${escapeSlack(e.who)}* ${VERB[e.kind]} *${escapeSlack(e.postName)}*`;
  const where = [e.projectName, e.clientName].filter(Boolean).map((s) => escapeSlack(s!)).join(" · ");
  const words = e.body?.trim()
    ? escapeSlack(e.body.trim().length > MAX_WORDS ? `${e.body.trim().slice(0, MAX_WORDS)}…` : e.body.trim())
        .split("\n")
        .map((line) => `>${line}`)
        .join("\n")
    : null;
  const blocks: unknown[] = [
    { type: "section", text: { type: "mrkdwn", text: headline } },
    ...(words ? [{ type: "section", text: { type: "mrkdwn", text: words } }] : []),
    ...(e.mentions?.length
      ? [{ type: "section", text: { type: "mrkdwn", text: `Mentions: ${e.mentions.map(tag).join(", ")}` } }]
      : []),
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: e.isPrivate ? `${where} · Private comment, for the team` : where }],
    },
    {
      type: "actions",
      elements: [{ type: "button", text: { type: "plain_text", text: "Open in Frank" }, url: e.url }],
    },
  ];
  // The plain words, for notifications and screen readers. Slack notifies
  // whoever's tagged here, so the tags lead.
  const tags = e.mentions?.filter((m) => m.slackId).map(tag).join(" ");
  const text = `${tags ? `${tags} ` : ""}${e.who} ${VERB[e.kind]} ${e.postName}${e.body?.trim() ? `: ${e.body.trim().slice(0, 200)}` : ""}`;
  return { text, blocks };
}
