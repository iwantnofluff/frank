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
}

export type DesignMode = "concept" | "rework";

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
    '"references":[{"n":1,"lessons":["one short sentence on something this reference does that works: composition, colour, type and hierarchy, or the hook"]}]',
    '"worked":["what has worked across the references, grounded in what you can see and the figures given"]',
    `"directions":[{"title":"a few words","idea":"the idea in one line","layout":"what goes where","style":"photo, illustration or type-led, and the look","palette":"the colours","textOnImage":"where the Text on Image sits and how it's set"${
      multi
        ? `,"slides":["what the designer makes on each ${context.frameNoun.toLowerCase()}: the shot or illustration, its composition and where the text sits; exactly ${multi}, never the words themselves"]`
        : ""
    }${context.isVideo ? ',"reel":{"hook":"the first three seconds","shots":["each shot, with its pacing"],"end":"the last frame"}' : ""}}]`,
    '"guardrails":{"format":["the format\'s shape, safe areas and limits"],"client":["the client\'s dos and don\'ts, from their knowledge"],"avoid":["what to avoid, from the client\'s feedback"]}}',
  ].join(",");

  return [
    "You are a senior art director at a content agency, writing a design direction for the designer making one post. Be specific and visual: say what goes where, how big, in what colour and type, never just \"make it eye-catching\". Ground everything in the brief, the references and the knowledge below; don't invent facts about the client or figures about the references.",
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
    `${
      context.mode === "rework"
        ? "Rework the team's notes rather than starting again: keep what they decided, make it specific and visual, fill what's missing, and correct anything that goes against the brand or the client's feedback, saying so in the summary. Offer one or two reworked versions: the first stays closest to their notes, the second may go further. Each direction's title says how it differs."
        : "Offer two or three directions, each genuinely different."
    }${
      multi
        ? ` Each direction gives exactly ${multi} lines in slides, one per ${context.frameNoun.toLowerCase()}, in order: what to design on it. The Text on Image is already written: say where it sits, don't repeat it.`
        : ""
    }${context.isVideo ? " Each direction includes the reel: the hook in the first three seconds, the shots with their pacing, and the end frame; keep text clear of the bottom fifth and right edge, where the caption and buttons sit." : ""} Keep each field to a sentence or two, each list to five points or fewer, and each reference to three lessons or fewer.`,
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
export function parseDesignDirection(text: string, slideCount: number | null, isVideo: boolean): DesignDirection | null {
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
  return direction.directions.length ? direction : null;
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
            ? { hook: str(reel.hook), shots: list(reel.shots, 10), end: str(reel.end) }
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
      .map((r: Record<string, unknown>) => ({ n: Number(r?.n), lessons: list(r?.lessons, 3) }))
      .filter((r) => Number.isInteger(r.n) && r.n > 0 && r.lessons.length),
    worked: list(raw.worked),
    directions,
    guardrails: { format: list(guard.format), client: list(guard.client), avoid: list(guard.avoid) },
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
    d.textOnImage && `Text on Image: ${d.textOnImage}`,
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
