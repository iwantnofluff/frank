import { parsePartialJson } from "./partial-json.ts";

// Design with Frank (phase110): a design direction for one post. Pure and
// unit-testable: the route gathers the brief, the references as read and
// the client's context; this turns them into one prompt and reads the
// direction back out of the reply.

export interface DesignReference {
  n: number;
  // Null for an image the team pasted (phase111).
  url: string | null;
  title: string | null;
  // The page's own description: for a public Instagram post, its likes,
  // comments, date and caption.
  description: string | null;
  siteName: string | null;
  // Whether its preview image is attached, as "Reference n".
  hasImage: boolean;
}

export interface DesignContext {
  postName: string;
  formatLabel: string;
  concept: string | null;
  approachNotes: string[];
  formatDirection: string | null;
  // Images on a multi-image post, and what each is called (Slide, Image,
  // Story…); null for a single image or a video.
  slideCount: number | null;
  frameNoun: string;
  isVideo: boolean;
  textOnImage: string[];
  strategy?: string | null;
  agencyNotes: { title: string; body: string }[];
  clientNotes: { title: string; body: string }[];
  fileTitles: string[];
  clientFeedback: { post: string; body: string; category: string | null }[];
  references: DesignReference[];
  // From the Concept alone, or a rework of the team's own Notes for
  // Designer (direct instruction, as Draft with Frank drafts or reviews).
  mode?: DesignMode;
  notes?: { overall: string; slides: string[] };
  // The copy that goes with it (direct instruction): a video's VO script,
  // and the caption and other copy fields, labelled.
  voiceover?: string | null;
  copy?: { label: string; text: string }[];
  // A follow-up in a conversation (direct instruction, as Draft with
  // Frank's): what the colleague asks now, what was asked and answered
  // before, and the direction as it last stood.
  ask?: string;
  conversation?: { ask: string; reply: string }[];
  previous?: DesignDirection | null;
}

export type DesignMode = "concept" | "rework" | "followup";

export interface DesignDirectionOption {
  title: string;
  idea: string;
  layout: string;
  style: string;
  palette: string;
  textOnImage: string;
  // One line per slide, for a multi-image post.
  slides: string[];
  // For a video: the first three seconds, the shots, the last frame.
  reel: { hook: string; shots: string[]; end: string } | null;
}

export interface DesignDirection {
  // How it was asked for; from the Concept when not said (phase110's).
  mode?: DesignMode;
  // The conversation it belongs to (its first direction's), the
  // colleague's message for a follow-up, and when it was written, for
  // ordering within the conversation.
  thread?: string;
  ask?: string;
  at?: string;
  summary: string;
  references: { n: number; lessons: string[] }[];
  worked: string[];
  directions: DesignDirectionOption[];
  guardrails: { format: string[]; client: string[]; avoid: string[] };
}

const clip = (text: string, max: number) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

const notes = (heading: string, list: { title: string; body: string }[]) =>
  list.length ? `${heading}:\n${list.map((n) => `- ${n.title}: ${clip(n.body, 1500)}`).join("\n")}` : null;

function referencesBlock(refs: DesignReference[]): string {
  if (!refs.length) {
    return "References: none given. Work from the concept, and say in the summary that adding references would sharpen the direction.";
  }
  return [
    "References the team gave for this post. Each one's preview image is attached as \"Reference n\" where it could be read. If an image is only the site's own logo or sharing card, not the post itself, say so in one lesson and take nothing from it. Where a description gives likes and comments, that is how the post performed: use it to say which did best, and never invent figures that aren't there.",
    ...refs.map((r) =>
      [
        r.url ? `Reference ${r.n}: ${r.url}` : `Reference ${r.n}: an image the team pasted`,
        r.siteName ? `  Site: ${r.siteName}` : null,
        r.title ? `  Title: ${clip(r.title, 200)}` : null,
        r.description ? `  Description: ${clip(r.description, 400)}` : null,
        r.hasImage ? "  Image: attached" : "  Image: couldn't be read (the page needs a sign-in or refused); go by the text, or say it couldn't be seen",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  ].join("\n");
}

function followupBlock(context: DesignContext): string {
  const previous = context.previous
    ? clip(JSON.stringify({ summary: context.previous.summary, directions: context.previous.directions, guardrails: context.previous.guardrails }), 12000)
    : null;
  return [
    previous ? `Your direction as it last stood, as JSON:\n${previous}` : null,
    context.conversation?.length
      ? `The conversation so far:\n${context.conversation.map((t) => `Colleague: ${clip(t.ask, 600)}\nYou: ${clip(t.reply, 600)}`).join("\n")}`
      : null,
    `Your colleague now asks: ${clip(context.ask ?? "", 2000)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function notesBlock(notes: { overall: string; slides: string[] }, multi: number | null, frameNoun: string): string {
  const slides = notes.slides
    .map((t, i) => (t.trim() ? `- ${frameNoun} ${i + 1}: ${clip(t, 600)}` : null))
    .filter(Boolean);
  return [
    "The team's Notes for Designer for this post, to rework:",
    notes.overall.trim() ? clip(notes.overall, 3000) : "(no overall note)",
    multi && slides.length ? `By ${frameNoun.toLowerCase()}:\n${slides.join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildDesignDirectionPrompt(context: DesignContext): string {
  const multi = context.slideCount && context.slideCount > 1 ? context.slideCount : null;
  const shape = [
    '{"summary":"one or two sentences: the design problem this post solves"',
    '"references":[{"n":1,"lessons":["one short sentence on what this reference does well"]}]',
    '"worked":["one short sentence on what has worked across the references, grounded in what you can see and the figures given"]',
    `"directions":[{"title":"a few words","idea":"the idea, in one sentence","layout":"the overall feel of the composition, in a few words, not where each element goes","style":"photo, illustration or type-led, and the mood","palette":"the colour feel, in a few words","textOnImage":"type and placement: the feel of the type and roughly where the words sit, in a few words, never the words themselves"${
      multi
        ? `,"slides":["each ${context.frameNoun.toLowerCase()}'s role in the set, in a few words (the opener, the hero, the close), not how to build it; exactly ${multi}"]`
        : ""
    }${context.isVideo ? ',"reel":{"hook":"what grabs attention in the first three seconds, in a sentence","shots":["three to five beats, a few words each"],"end":"the last frame, in a few words"}' : ""}}]`,
    '"guardrails":{"format":["only what must hold for the format, if anything"],"client":["only the client\'s non-negotiables"],"avoid":["only what the client\'s feedback says to avoid"]}}',
  ].join(",");

  return [
    "You are a senior art director at a content agency, briefing the designer making one post. Give them a clear idea and a feeling to work towards, and the few things that must hold, then leave the execution to them: don't prescribe where each element goes, sizes or step-by-step builds (direct instruction: room for the designer's own interpretation). Be clear and visual, never vague (not just \"make it eye-catching\"), and short enough to take in at a glance. Ground everything in the brief, the references and the knowledge below; don't invent facts about the client or figures about the references.",
    `Post: ${context.postName}`,
    `Format: ${context.formatLabel}${multi ? `, ${multi} ${context.frameNoun.toLowerCase()}s` : ""}${context.isVideo ? " (video)" : ""}`,
    context.concept ? `Concept:\n${context.concept}` : "Concept: none written yet.",
    context.approachNotes.length
      ? `The psychology this post's copy uses (its WIIFM Direction; the design should carry it too):\n${context.approachNotes.map((n) => `- ${n}`).join("\n")}`
      : null,
    context.textOnImage.some((t) => t.trim())
      ? `Text on Image already written:\n${context.textOnImage.map((t, i) => (t.trim() ? `- ${multi ? `${context.frameNoun} ${i + 1}: ` : ""}${clip(t, 300)}` : null)).filter(Boolean).join("\n")}`
      : null,
    context.formatDirection ? `Format direction (follow it):\n${context.formatDirection}` : null,
    context.copy?.length
      ? `The copy that goes with it (the visual should carry the same idea without repeating it):\n${context.copy.map((c) => `- ${c.label}: ${clip(c.text, 600)}`).join("\n")}`
      : null,
    context.voiceover?.trim()
      ? `The VO script, spoken over the video: plan the shots to what's said, in time with it.\n${clip(context.voiceover, 1500)}`
      : null,
    context.strategy ?? null,
    notes("Workspace knowledge", context.agencyNotes),
    notes("Client knowledge", context.clientNotes),
    context.fileTitles.length ? `Attached knowledge files: ${context.fileTitles.join(", ")}.` : null,
    context.clientFeedback.length
      ? [
          "What the client has asked for in their comments, newest first. Where the same kind of correction comes up more than once, name it in the guardrails' avoid list.",
          ...context.clientFeedback.map((f) => `- On "${f.post}"${f.category ? ` (${f.category})` : ""}: ${clip(f.body, 300)}`),
        ].join("\n")
      : null,
    referencesBlock(context.references),
    context.mode === "rework" && context.notes ? notesBlock(context.notes, multi, context.frameNoun) : null,
    context.mode === "followup" ? followupBlock(context) : null,
    `${
      context.mode === "followup"
        ? "This is a follow-up in a conversation with your colleague about this direction. If they ask for changes, reply with the whole direction revised, every field in the same shape and every direction with its title (kept unless its idea changes), and say in the summary, in a sentence or two, what you changed and why. If they only ask a question or for your view, answer it in the summary, warmly and briefly, and leave directions as an empty list."
        : context.mode === "rework"
        ? "Rework the team's notes rather than starting again: keep what they decided, make it clearer, fill what's missing (lightly: leave room for the designer), and correct anything that goes against the brand or the client's feedback, saying so in the summary. Offer one or two reworked versions: the first stays closest to their notes, the second may go further. Each direction's title says how it differs."
        : "Offer two directions, each a genuinely different idea."
    }${
      multi
        ? ` Each direction gives exactly ${multi} lines in slides, one per ${context.frameNoun.toLowerCase()}, in order: a few words on that ${context.frameNoun.toLowerCase()}'s role in the set. The Text on Image is already written: never repeat it.`
        : ""
    }${context.isVideo ? " Each direction includes the reel: the hook in the first three seconds, three to five beats, and the end frame, a few words each; keep text clear of the bottom fifth and right edge, where the caption and buttons sit." : ""} Keep every field to one short sentence or less; give each reference two lessons at most, what has worked three points at most, and the guardrails five points at most in all, only the essentials.`,
    `Reply with one JSON object only, no prose before or after, fenced as \`\`\`json and shaped: ${shape}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const str = (v: unknown, max = 600) => (typeof v === "string" ? clip(v, max) : "");
const list = (v: unknown, max = 6) =>
  (Array.isArray(v) ? v : [])
    .map((x) => str(x, 400))
    .filter(Boolean)
    .slice(0, max);

// The direction in Frank's reply: the JSON, fenced or not, tidied to the
// expected shape. Null when there's nothing usable.
// A follow-up that only answers a question may have no directions
// (allowEmpty); then the summary is the answer.
export function parseDesignDirection(
  text: string,
  slideCount: number | null,
  isVideo: boolean,
  allowEmpty = false,
): DesignDirection | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i)?.[1];
  const candidates = [fenced, text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)].filter(
    (c): c is string => !!c && c.trim().startsWith("{"),
  );
  let raw: Record<string, unknown> | null = null;
  for (const c of candidates) {
    try {
      raw = JSON.parse(c);
      break;
    } catch {
      // The next way of finding it.
    }
  }
  if (!raw || typeof raw !== "object") return null;
  const direction = tidyDirection(raw, slideCount, isVideo, false);
  return direction.directions.length || (allowEmpty && direction.summary) ? direction : null;
}

// What there is of the direction so far, while Frank is still writing it
// (direct instruction: shown as it's written). A direction shows from its
// title on.
export function parsePartialDesignDirection(text: string, slideCount: number | null, isVideo: boolean): DesignDirection {
  const raw = parsePartialJson(text);
  return tidyDirection(raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}, slideCount, isVideo, true);
}

function tidyDirection(raw: Record<string, unknown>, slideCount: number | null, isVideo: boolean, partial: boolean): DesignDirection {
  const multi = slideCount && slideCount > 1 ? slideCount : 0;

  const directions = (Array.isArray(raw.directions) ? raw.directions : [])
    .map((d: Record<string, unknown>): DesignDirectionOption => {
      const reel = d?.reel as Record<string, unknown> | undefined;
      return {
        title: str(d?.title, 80),
        idea: str(d?.idea),
        layout: str(d?.layout),
        style: str(d?.style),
        palette: str(d?.palette),
        textOnImage: str(d?.textOnImage),
        slides: multi ? list(d?.slides, multi) : [],
        reel:
          isVideo && reel && typeof reel === "object"
            ? { hook: str(reel.hook), shots: list(reel.shots, 6), end: str(reel.end) }
            : null,
      };
    })
    .filter((d) => d.idea || d.layout || (partial && d.title))
    .slice(0, 3)
    .map((d, i) => ({ ...d, title: d.title || `Direction ${i + 1}` }));

  const guard = (raw.guardrails ?? {}) as Record<string, unknown>;
  return {
    summary: str(raw.summary),
    references: (Array.isArray(raw.references) ? raw.references : [])
      .map((r: Record<string, unknown>) => ({ n: Number(r?.n), lessons: list(r?.lessons, 2) }))
      .filter((r) => Number.isInteger(r.n) && r.n > 0 && r.lessons.length),
    worked: list(raw.worked, 3),
    directions,
    guardrails: { format: list(guard.format, 3), client: list(guard.client, 3), avoid: list(guard.avoid, 3) },
  };
}

// A direction as one Notes for Designer entry: what the designer reads in
// the table and on the post.
export function directionAsNote(d: DesignDirectionOption): string {
  return [
    `${d.title}: ${d.idea}`,
    d.layout && `Layout: ${d.layout}`,
    d.style && `Style: ${d.style}`,
    d.palette && `Palette: ${d.palette}`,
    // Where the words sit and how they're set, named apart from the Content
    // tab's Text on Image (the words themselves; direct instruction).
    d.textOnImage && `Type and placement: ${d.textOnImage}`,
    d.reel?.hook && `First three seconds: ${d.reel.hook}`,
    d.reel?.shots.length && `Shots: ${d.reel.shots.join(" / ")}`,
    d.reel?.end && `End frame: ${d.reel.end}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// A direction as the post's Design Direction box (phase111): the direction
// and its guardrails, ready to edit.
export function directionAsDesignNote(d: DesignDirectionOption, guardrails: DesignDirection["guardrails"]): string {
  const rules = [...guardrails.format, ...guardrails.client, ...guardrails.avoid];
  return [directionAsNote(d), rules.length ? `Guardrails:\n${rules.map((r) => `- ${r}`).join("\n")}` : null]
    .filter(Boolean)
    .join("\n\n");
}
