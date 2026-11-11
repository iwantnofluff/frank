import { HELP_ARTICLES, HELP_CATEGORIES, helpPlain, type HelpBlock } from "@/lib/help-content";
import { SETTINGS_SECTIONS } from "@/lib/settings-nav";
import { clientSettingsSections } from "@/lib/client-settings-nav";
import { GUIDES } from "@/lib/tour";

// Ask Frank (phase147, direct instruction): questions about Frank itself,
// answered from Help's own articles, with links to the pages and topics
// they're about. The model is a smaller, cheaper one; requests are logged
// but not counted towards the workspace's AI limit (run-ai-task.ts).

export const ASK_FRANK_MODEL = "claude-haiku-5-5";

// What a person asks, and what Frank said before, in this visit.
export interface AskTurn {
  role: "user" | "frank";
  text: string;
}

export type Asker = "owner" | "admin" | "user" | "client";

function blockText(b: HelpBlock): string {
  switch (b.kind) {
    case "h":
      return `### ${b.text}`;
    case "p":
      return b.text;
    case "list":
      return b.items.map((t) => `- ${t}`).join("\n");
    case "steps":
      return b.items.map((t, i) => `${i + 1}. ${t}`).join("\n");
    default:
      return "items" in b ? b.items.join("\n") : "";
  }
}

// Every article, with its id and its links as written ([words](target)),
// so Frank can link the same way.
function articles(): string {
  return HELP_CATEGORIES.map((c) => {
    const list = HELP_ARTICLES.filter((a) => a.category === c.id);
    return [
      `# ${c.label}`,
      ...list.map((a) =>
        [`## ${a.title} (help:${a.id})${GUIDES[a.id] ? " [has a Show Me walkthrough]" : ""}`, a.summary, ...a.blocks.map(blockText)].join(
          "\n\n",
        ),
      ),
    ].join("\n\n");
  }).join("\n\n");
}

function pages(): string {
  const workspace = SETTINGS_SECTIONS.flatMap((s) => s.pages.filter((p) => !p.soon).map((p) => `- ${s.label} → ${p.label}: ${p.href}`));
  const client = clientSettingsSections("ID", true).flatMap((s) =>
    s.pages.map((p) => `- Client Settings → ${s.label} → ${p.label}: client:${p.href.replace("/clients/ID", "")}`),
  );
  return [
    "- Clients (every client): /dashboard",
    "- A client's own page, with its projects: client:",
    ...workspace,
    ...client,
  ].join("\n");
}

// The part every question shares (kept between messages by the provider).
export function askFrankBase(): string {
  return `You are Frank, the assistant inside Frank, an app where agencies plan social media and other content, write it, and get it approved by their clients. You answer questions about using Frank, for the person signed in.

How to answer:
- Answer only from the Help articles below. If they don't cover it, say plainly that you don't know, and suggest where in Frank to look or that they contact their workspace's Owner. Never invent a feature, button, setting or page.
- Only answer questions about Frank. For anything else, say briefly that you can only help with Frank.
- Be short and practical: a sentence or two, then numbered steps when it's a how-to. Use the names of buttons, tabs and pages exactly as the articles write them.
- Write plainly and warmly. Sentence case. No exclamation marks, no em dashes, no bold, no headings, no emojis.
- Link to what you mention, in this exact form: [words](target). Targets:
  - a workspace page: its path, from the list below, such as [Workspace Settings → Team → Users](/settings/team/users)
  - a client's page: client: then its path, such as [Knowledge → Discovery](client:/settings/knowledge), or [the client's page](client:)
  - a Help topic: help: then its id, such as [Send Posts to Your Client for Review](help:send-for-review)
  - a topic marked [has a Show Me walkthrough]: when it would help to see it, end with [Show me](showme:<its id>)
- Only link to the targets listed here or in the articles. Never make up a path.
- Fit the answer to who's asking (given with each question). A client's own people can't use Workspace Settings or Client Settings, plan posts or invite anyone: for them, explain what they can do (review, comment, approve) and that their agency handles the rest. Don't offer Show Me to them. Users see only the clients picked for them; Owners and Admins manage the workspace.

Pages you can link to:
${pages()}

The Help articles:

${articles()}`;
}

// This question: who's asking, where they are, what was said before.
export function askFrankQuestion(asker: Asker, path: string, history: AskTurn[], question: string): string {
  const who = {
    owner: "an Owner of the workspace (can do everything)",
    admin: "an Admin of the workspace (manages it, sees every client)",
    user: "a User on the agency's team (works on the clients picked for them)",
    client: "one of a client's own people, reviewing their agency's work (not the agency's team)",
  }[asker];
  // The page, without its ids.
  const where = path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "…");
  const before = history
    .slice(-6)
    .map((t) => `${t.role === "user" ? "They asked" : "You answered"}: ${helpPlain(t.text).slice(0, 1200)}`)
    .join("\n\n");
  return `Who's asking: ${who}.
The page they're on: ${where}

${before ? `Earlier in this conversation:\n\n${before}\n\n` : ""}Their question: ${question}`;
}
