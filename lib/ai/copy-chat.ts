// "Write with Claude" (phase52): a conversation about one post's copy.
// Pure and unit-testable: the route gathers the context and history; this
// turns them into one prompt and reads the drafts back out of the reply.

export interface CopyChatField {
  key: string;
  label: string;
}

export interface CopyChatContext {
  postName: string;
  concept: string | null;
  approachNotes: string[];
  formatLabel: string;
  // Each chosen format's direction, already named when there are several.
  formatDirection: string | null;
  agencyNotes: { title: string; body: string }[];
  clientNotes: { title: string; body: string }[];
  // Knowledge files sent alongside (PDFs, images), by title.
  fileTitles: string[];
  fields: CopyChatField[];
}

export interface CopyChatTurn {
  role: "user" | "assistant";
  body: string;
}

export interface CopyDraft {
  label: string;
  fields: Record<string, string>;
}

export type CopyChatMode = "draft" | "review";

// Text on Image as chat fields (direct instruction): one per slide for a
// carousel, one otherwise, alongside the formats' own copy fields.
const SLIDE_PREFIX = "slide_";
export function slideTextFields(slideCount: number | null): CopyChatField[] {
  return Array.from({ length: slideCount ?? 1 }, (_, i) => ({
    key: `${SLIDE_PREFIX}${i + 1}`,
    label: slideCount ? `Text on Image, Slide ${i + 1}` : "Text on Image",
  }));
}

export const isSlideField = (key: string) => key.startsWith(SLIDE_PREFIX);

// The editor's slide text as chat fields.
export function slideTextAsFields(slideText: string[]): Record<string, string> {
  return Object.fromEntries(slideText.map((t, i) => [`${SLIDE_PREFIX}${i + 1}`, t]));
}

// A draft's slide fields laid over the editor's slide text, by position:
// a slide the draft leaves out keeps what was there.
export function applySlideDraft(slideText: string[], fields: Record<string, string>): string[] {
  const next = [...slideText];
  for (const [key, value] of Object.entries(fields)) {
    if (!isSlideField(key)) continue;
    const i = Number(key.slice(SLIDE_PREFIX.length)) - 1;
    if (Number.isInteger(i) && i >= 0) {
      while (next.length < i) next.push("");
      next[i] = value;
    }
  }
  return next;
}

// What the person asked when they started, in their own words, so the
// conversation reads naturally afterwards.
export function openingMessage(mode: CopyChatMode, currentFields: Record<string, string>, fields: CopyChatField[]): string {
  if (mode === "draft") return "Draft some copy for this post from the concept.";
  const draft = fields
    .filter((f) => currentFields[f.key]?.trim())
    .map((f) => `${f.label}:\n${currentFields[f.key].trim()}`)
    .join("\n\n");
  return `Here's my first draft. What works, what doesn't, and how would you improve it?\n\n${draft}`;
}

const notes = (heading: string, list: { title: string; body: string }[]) =>
  list.length ? `${heading}:\n${list.map((n) => `- ${n.title}: ${n.body}`).join("\n")}` : null;

export function buildCopyChatPrompt(
  context: CopyChatContext,
  history: CopyChatTurn[],
  currentFields: Record<string, string>,
): string {
  return buildCopyChatPromptParts(context, history, currentFields).join("\n\n");
}

// The prompt in two parts (direct instruction: Draft with Frank was slow):
// what stays the same for every message of a conversation (the brief, the
// knowledge, the instructions), which Claude keeps for a few minutes and
// reads again quickly and cheaply, and what changes each message (the copy
// in the editor and the conversation).
export function buildCopyChatPromptParts(
  context: CopyChatContext,
  history: CopyChatTurn[],
  currentFields: Record<string, string>,
): [string, string] {
  const fieldList = context.fields.map((f) => `"${f.key}" (${f.label})`).join(", ");
  const current = context.fields
    .filter((f) => currentFields[f.key]?.trim())
    .map((f) => `${f.label}: ${currentFields[f.key].trim()}`)
    .join("\n");

  const stable = [
    "You are a senior copywriter at a content agency, working with a colleague on the copy for one post. Be specific, warm and brief. Ground everything in the brief and the knowledge below; don't invent facts about the client.",
    `Post: ${context.postName}`,
    `Format: ${context.formatLabel}`,
    context.concept ? `Concept:\n${context.concept}` : "Concept: none written yet.",
    context.approachNotes.length
      ? `What the reader should get from it (WIIFM):\n${context.approachNotes.map((n) => `- ${n}`).join("\n")}`
      : null,
    context.formatDirection ? `Format direction (follow it):\n${context.formatDirection}` : null,
    notes("Workspace knowledge", context.agencyNotes),
    notes("Client knowledge", context.clientNotes),
    context.fileTitles.length ? `Attached knowledge files: ${context.fileTitles.join(", ")}.` : null,
    context.fields.some((f) => isSlideField(f.key))
      ? "Text on Image is the words set on the artwork itself, separate from the caption: short and easy to read at a glance, never a repeat of the caption. For a carousel, each slide's text moves the story on to the next. Include it in every draft."
      : null,
    context.formatLabel.includes(" + ")
      ? `This post goes out as ${context.formatLabel}, and they share one set of fields: write one version of each field that works for all of them. Never split a field by platform ("IG: … LinkedIn: …").`
      : null,
    "Write your reply as plain text: no markdown, no asterisks, no headings. Keep it to a few sentences; the drafts carry the copy.",
    `When you propose copy, end your reply with one JSON block, fenced as \`\`\`json, shaped {"drafts":[{"label":"a few words on the angle","fields":{...}}]}, where fields uses only these keys: ${fieldList}. ${
      context.fields.length > 4 ? "Offer one or two drafts, each different." : "Offer up to three drafts, each different."
    } When you're only commenting or answering, leave the JSON out. Never mention the JSON in your prose.`,
  ];
  const turn = [
    current ? `The copy in the editor right now:\n${current}` : "The copy in the editor is empty.",
    "The conversation so far:",
    ...history.map((t) => `${t.role === "user" ? "Colleague" : "You"}: ${t.body}`),
    "You:",
  ];
  return [stable.filter(Boolean).join("\n\n"), turn.join("\n\n")];
}

// The drafts block: from its opening fence to the closing one, or to the
// end of the reply when Claude was cut off before closing it.
const FENCE = /```json\s*([\s\S]*?)(?:```|$)/i;

// The reply's prose as it should read: never the JSON (closed or not), and
// no markdown emphasis, which shows as raw asterisks. Also used to show
// messages saved before this, which can still hold a cut-off block.
export function cleanReplyBody(text: string): string {
  return text
    .replace(FENCE, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .trim();
}

// Every complete object in the drafts array, even when the reply was cut
// off partway through a later one: a bracket count that skips strings.
function completeDrafts(json: string): unknown[] {
  const start = json.indexOf("[", json.indexOf('"drafts"'));
  if (start < 0) return [];
  const out: unknown[] = [];
  let depth = 0;
  let from = -1;
  let inString = false;
  for (let i = start + 1; i < json.length; i++) {
    const ch = json[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") {
      if (depth === 0) from = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && from >= 0) {
        try {
          out.push(JSON.parse(json.slice(from, i + 1)));
        } catch {
          // Not a whole draft after all; skip it.
        }
        from = -1;
      }
    } else if (ch === "]" && depth === 0) break;
  }
  return out;
}

// The prose to show, and any drafts offered (only the keys this post's
// formats use, and only non-empty ones). A block cut off partway keeps
// the drafts that were finished.
export function parseCopyChatReply(text: string, fields: CopyChatField[]): { body: string; drafts: CopyDraft[] } {
  const match = text.match(FENCE);
  const body = cleanReplyBody(text);
  if (!match) return { body, drafts: [] };
  const allowed = new Set(fields.map((f) => f.key));
  let raw: unknown[];
  try {
    raw = (JSON.parse(match[1]) as { drafts?: unknown[] }).drafts ?? [];
  } catch {
    raw = completeDrafts(match[1]);
  }
  const drafts = (raw as { label?: unknown; fields?: Record<string, unknown> }[])
    .map((d, i) => ({
      label: typeof d?.label === "string" && d.label.trim() ? d.label.trim() : `Draft ${i + 1}`,
      fields: Object.fromEntries(
        Object.entries(d?.fields ?? {}).filter(
          (entry): entry is [string, string] => allowed.has(entry[0]) && typeof entry[1] === "string" && !!entry[1].trim(),
        ),
      ),
    }))
    .filter((d) => Object.keys(d.fields).length > 0)
    .slice(0, 3);
  return { body: body || "Here are some options.", drafts };
}
