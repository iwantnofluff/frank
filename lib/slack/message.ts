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

// A project's List (phase155): the columns Frank fills, found by name when
// the List is connected. The first (title) column takes the headline.
export type ListKey = "title" | "post" | "client" | "comment" | "link" | "from";
export type ListColumns = Partial<Record<ListKey, { id: string; type: string }>>;

const NAMED: Record<Exclude<ListKey, "title">, string[]> = {
  post: ["post", "creative"],
  client: ["client"],
  comment: ["comment", "comments", "feedback", "words"],
  link: ["link", "url", "open in frank"],
  from: ["from", "who", "by"],
};
const WRITABLE = new Set(["text", "rich_text", "link"]);

export function matchListColumns(columns: { id: string; name: string; type: string; is_primary_column?: boolean }[]): ListColumns {
  const out: ListColumns = {};
  const title = columns.find((c) => c.is_primary_column) ?? columns[0];
  if (title && WRITABLE.has(title.type)) out.title = { id: title.id, type: title.type };
  for (const [key, names] of Object.entries(NAMED) as [Exclude<ListKey, "title">, string[]][]) {
    const c = columns.find((col) => col !== title && WRITABLE.has(col.type) && names.includes(col.name.trim().toLowerCase()));
    if (c) out[key] = { id: c.id, type: c.type };
  }
  return out;
}

const richText = (text: string) => [
  { type: "rich_text", elements: [{ type: "rich_text_section", elements: [{ type: "text", text }] }] },
];

// An item's cells: each column as its type takes words (rich text) or a link.
export function listItemFields(columns: ListColumns, e: SlackEvent): Record<string, unknown>[] {
  const headline = `${e.who} ${VERB[e.kind]} ${e.postName}`;
  const values: Record<ListKey, string | null> = {
    title: headline,
    post: e.postName,
    client: e.clientName,
    comment: e.body?.trim() ? e.body.trim().slice(0, 3000) : null,
    link: e.url,
    from: e.who,
  };
  const fields: Record<string, unknown>[] = [];
  for (const [key, col] of Object.entries(columns) as [ListKey, { id: string; type: string }][]) {
    const value = values[key];
    if (!value) continue;
    if (col.type === "link") {
      const url = key === "link" ? e.url : null;
      if (url) fields.push({ column_id: col.id, link: [{ original_url: url, display_as_url: false, display_name: "Open in Frank" }] });
    } else {
      fields.push({ column_id: col.id, rich_text: richText(value) });
    }
  }
  return fields;
}

