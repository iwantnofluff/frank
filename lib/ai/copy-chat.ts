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
  const fieldList = context.fields.map((f) => `"${f.key}" (${f.label})`).join(", ");
  const current = context.fields
    .filter((f) => currentFields[f.key]?.trim())
    .map((f) => `${f.label}: ${currentFields[f.key].trim()}`)
    .join("\n");

  const parts = [
    "You are a senior copywriter at a content agency, working with a colleague on the copy for one post. Be specific, warm and brief. Ground everything in the brief and the knowledge below; don't invent facts about the client.",
    `Post: ${context.postName}`,
    `Format: ${context.formatLabel}`,
    context.concept ? `Concept:\n${context.concept}` : "Concept: none written yet.",
    context.approachNotes.length
      ? `What the reader should get from it (WIIFM):\n${context.approachNotes.map((n) => `- ${n}`).join("\n")}`
      : null,
    context.formatDirection ? `Format direction (follow it):\n${context.formatDirection}` : null,
    notes("Agency knowledge", context.agencyNotes),
    notes("Client knowledge", context.clientNotes),
    context.fileTitles.length ? `Attached knowledge files: ${context.fileTitles.join(", ")}.` : null,
    current ? `The copy in the editor right now:\n${current}` : "The copy in the editor is empty.",
    context.fields.some((f) => isSlideField(f.key))
      ? "Text on Image is the words set on the artwork itself, separate from the caption: short and easy to read at a glance, never a repeat of the caption. For a carousel, each slide's text moves the story on to the next. Include it in every draft."
      : null,
    `When you propose copy, end your reply with one JSON block, fenced as \`\`\`json, shaped {"drafts":[{"label":"a few words on the angle","fields":{...}}]}, where fields uses only these keys: ${fieldList}. Offer up to three drafts, each different. When you're only commenting or answering, leave the JSON out. Never mention the JSON in your prose.`,
    "The conversation so far:",
    ...history.map((t) => `${t.role === "user" ? "Colleague" : "You"}: ${t.body}`),
    "You:",
  ];
  return parts.filter(Boolean).join("\n\n");
}

const FENCE = /```json\s*([\s\S]*?)```/i;

// The prose to show, and any drafts offered (only the keys this post's
// formats use, and only non-empty ones).
export function parseCopyChatReply(text: string, fields: CopyChatField[]): { body: string; drafts: CopyDraft[] } {
  const match = text.match(FENCE);
  const body = text.replace(FENCE, "").trim();
  if (!match) return { body: text.trim(), drafts: [] };
  const allowed = new Set(fields.map((f) => f.key));
  try {
    const parsed = JSON.parse(match[1]) as { drafts?: { label?: unknown; fields?: Record<string, unknown> }[] };
    const drafts = (parsed.drafts ?? [])
      .map((d, i) => ({
        label: typeof d.label === "string" && d.label.trim() ? d.label.trim() : `Draft ${i + 1}`,
        fields: Object.fromEntries(
          Object.entries(d.fields ?? {}).filter(
            (entry): entry is [string, string] => allowed.has(entry[0]) && typeof entry[1] === "string" && !!entry[1].trim(),
          ),
        ),
      }))
      .filter((d) => Object.keys(d.fields).length > 0)
      .slice(0, 3);
    return { body: body || "Here are some options.", drafts };
  } catch {
    // Unreadable JSON: show the whole reply rather than lose it.
    return { body: text.trim(), drafts: [] };
  }
}
