// The 41-format catalog, ported from the prototype's FORMATS object
// (frank-prototype.html). Application data, not a schema decision — the
// format_directions table's own comment already says the format list
// "lives in application data, not the database." creatives.format still
// stores the key (id below), never the label — matches that column's own
// comment, and deliberately diverges from the prototype's own save
// handler, which stores the label instead.
export interface FormatDefinition {
  id: string;
  category: string;
  label: string;
  aspectRatio: string;
  // Which copy_versions.fields keys this format actually uses — also
  // ported from the prototype's own FORMATS object (its `copy` array),
  // not invented here. copy_versions.fields is a plain jsonb object, so
  // no schema change was needed to support this — only which keys the UI
  // renders and drafts for changes per format. An empty array is real
  // data, not a gap: Instagram Story, Facebook Story, WhatsApp Status,
  // the Amazon image-only listings, Presentation Slide and Packaging all
  // have nothing beyond Text on Image (already a separate, brief-level
  // field, not part of this list).
  copyFields: string[];
}

// Key -> human label, ported verbatim from the prototype's COPYLBL.
export const COPY_FIELD_LABELS: Record<string, string> = {
  caption: "Caption",
  alt: "Alt Text",
  hook: "On-screen Hook",
  title: "Title",
  bullets: "Bullet Points",
  description: "Description",
  primary: "Primary Text",
  headline: "Headline",
  cta: "Call to Action",
  body: "Body Copy",
  subject: "Subject Line",
  preview: "Preview Text",
  notes: "Notes",
};

// Category order matches the prototype's FORMATS object, since that's the
// order a Content Type select should offer them in.
export const FORMAT_CATEGORIES = [
  "Social — organic",
  "Performance marketing",
  "Amazon",
  "Email and messaging",
  "Web and print",
  "General",
] as const;

export const FORMATS: FormatDefinition[] = [
  // Social — organic
  { id: "ig_feed", category: "Social — organic", label: "Instagram Post", aspectRatio: "4:5", copyFields: ["caption", "alt"] },
  { id: "ig_carousel", category: "Social — organic", label: "Instagram Carousel", aspectRatio: "4:5", copyFields: ["caption", "alt"] },
  { id: "ig_reel", category: "Social — organic", label: "Instagram Reel", aspectRatio: "9:16", copyFields: ["caption", "hook"] },
  { id: "ig_story", category: "Social — organic", label: "Instagram Story", aspectRatio: "9:16", copyFields: [] },
  { id: "fb_feed", category: "Social — organic", label: "Facebook Post", aspectRatio: "1.91:1", copyFields: ["caption"] },
  { id: "fb_story", category: "Social — organic", label: "Facebook Story", aspectRatio: "9:16", copyFields: [] },
  { id: "li_image", category: "Social — organic", label: "LinkedIn Single Image", aspectRatio: "1.91:1", copyFields: ["caption"] },
  { id: "li_doc", category: "Social — organic", label: "LinkedIn Carousel (Document)", aspectRatio: "1:1", copyFields: ["caption"] },
  { id: "li_video", category: "Social — organic", label: "LinkedIn Video", aspectRatio: "16:9", copyFields: ["caption"] },
  { id: "yt_video", category: "Social — organic", label: "YouTube Video", aspectRatio: "16:9", copyFields: ["title", "description"] },
  { id: "yt_short", category: "Social — organic", label: "YouTube Short", aspectRatio: "9:16", copyFields: ["title"] },
  { id: "yt_thumb", category: "Social — organic", label: "YouTube Thumbnail", aspectRatio: "16:9", copyFields: ["title"] },
  { id: "wa_status", category: "Social — organic", label: "WhatsApp Status", aspectRatio: "9:16", copyFields: [] },
  { id: "pin", category: "Social — organic", label: "Pinterest Pin", aspectRatio: "2:3", copyFields: ["title", "description"] },

  // Performance marketing
  { id: "meta_feed", category: "Performance marketing", label: "Meta Feed Ad", aspectRatio: "1:1", copyFields: ["primary", "headline", "description", "cta"] },
  { id: "meta_story", category: "Performance marketing", label: "Meta Stories / Reels Ad", aspectRatio: "9:16", copyFields: ["primary", "headline", "cta"] },
  { id: "meta_carousel", category: "Performance marketing", label: "Meta Carousel Ad", aspectRatio: "1:1", copyFields: ["primary", "headline", "cta"] },
  { id: "g_display", category: "Performance marketing", label: "Google Display Banner", aspectRatio: "multi", copyFields: ["headline", "description"] },
  { id: "g_rsa", category: "Performance marketing", label: "Google Responsive Search Ad", aspectRatio: "—", copyFields: ["headline", "description"] },
  { id: "g_pmax", category: "Performance marketing", label: "Performance Max Asset Group", aspectRatio: "multi", copyFields: ["headline", "description", "cta"] },
  { id: "yt_preroll", category: "Performance marketing", label: "YouTube Pre-roll / Bumper", aspectRatio: "16:9", copyFields: ["headline", "cta"] },
  { id: "li_sponsored", category: "Performance marketing", label: "LinkedIn Sponsored Content", aspectRatio: "1.91:1", copyFields: ["primary", "headline", "cta"] },

  // Amazon. Storefront Tile, Email Header Banner, Website Banner, Hoarding
  // and Print have no copy of their own (decided directly, 10 Nov 2026): the
  // asset is the whole of it, and any words on it go in Text on Image.
  { id: "apl_module", category: "Amazon", label: "A+ Content Module", aspectRatio: "1.6:1", copyFields: ["headline", "body"] },
  { id: "apl_premium", category: "Amazon", label: "A+ Premium Module", aspectRatio: "2.4:1", copyFields: ["headline", "body"] },
  { id: "amz_main", category: "Amazon", label: "Listing Main Image", aspectRatio: "1:1", copyFields: [] },
  { id: "amz_info", category: "Amazon", label: "Listing Infographic", aspectRatio: "1:1", copyFields: [] },
  // A product page's image gallery (direct instruction: a listing has several
  // images, updated together with its text): up to 9 square images, a
  // carousel's slides, with the listing's own copy. Not in the prototype.
  { id: "amz_gallery", category: "Amazon", label: "Listing Image Set", aspectRatio: "1:1", copyFields: ["title", "bullets", "description"] },
  { id: "amz_sb", category: "Amazon", label: "Sponsored Brands Banner", aspectRatio: "1.91:1", copyFields: ["headline"] },
  { id: "amz_store", category: "Amazon", label: "Storefront Tile", aspectRatio: "2:1", copyFields: [] },

  // Email and messaging
  { id: "em_full", category: "Email and messaging", label: "Email Campaign", aspectRatio: "—", copyFields: ["subject", "preview", "body"] },
  { id: "em_banner", category: "Email and messaging", label: "Email Header Banner", aspectRatio: "3:1", copyFields: [] },
  { id: "wa_broadcast", category: "Email and messaging", label: "WhatsApp Broadcast", aspectRatio: "1:1", copyFields: ["body"] },
  { id: "sms", category: "Email and messaging", label: "SMS", aspectRatio: "—", copyFields: ["body"] },
  { id: "push", category: "Email and messaging", label: "Push Notification", aspectRatio: "—", copyFields: ["title", "body"] },

  // Web and print
  { id: "lp", category: "Web and print", label: "Landing Page", aspectRatio: "—", copyFields: ["headline", "body", "cta"] },
  { id: "web_hero", category: "Web and print", label: "Website Banner / Hero", aspectRatio: "2.4:1", copyFields: [] },
  { id: "blog", category: "Web and print", label: "Blog Header", aspectRatio: "16:9", copyFields: ["title"] },
  { id: "deck", category: "Web and print", label: "Presentation Slide", aspectRatio: "16:9", copyFields: [] },
  { id: "ooh", category: "Web and print", label: "Hoarding / OOH", aspectRatio: "varies", copyFields: [] },
  { id: "print", category: "Web and print", label: "Print — Flyer or Poster", aspectRatio: "varies", copyFields: [] },
  { id: "packaging", category: "Web and print", label: "Packaging", aspectRatio: "varies", copyFields: [] },

  // General
  { id: "general", category: "General", label: "Other Creative", aspectRatio: "—", copyFields: ["notes"] },
];

// Formats that go out as video, so a post in any of them has a VO
// (voiceover) script (phase88, direct instruction: video formats only).
export const VIDEO_FORMAT_IDS = new Set([
  "ig_reel",
  "ig_story",
  "fb_story",
  "li_video",
  "yt_video",
  "yt_short",
  "wa_status",
  "meta_story",
  "yt_preroll",
]);

// Formats shown full screen, one frame at a time (direct instruction: a
// Story's artwork was cut off in the review's phone): drawn as Instagram
// draws a story, the artwork filling the screen with the account over it,
// rather than as a feed post with a header, likes and caption.
export const STORY_FORMAT_IDS = new Set(["ig_story", "fb_story", "wa_status", "meta_story"]);

export function isStoryFormat(id: string | null | undefined): boolean {
  return !!id && STORY_FORMAT_IDS.has(id);
}

// Reels and their like (direct instruction): full-screen vertical video,
// whose player gets a full-screen button.
const REEL_FORMAT_IDS = new Set(["ig_reel", "yt_short", "meta_story"]);
export function isReelFormat(id: string | null | undefined): boolean {
  return !!id && REEL_FORMAT_IDS.has(id);
}

export function hasVideoFormat(ids: string[]): boolean {
  return ids.some((id) => VIDEO_FORMAT_IDS.has(id));
}

export function formatById(id: string): FormatDefinition | undefined {
  return FORMATS.find((f) => f.id === id);
}

export function formatsByCategory(category: string): FormatDefinition[] {
  return FORMATS.filter((f) => f.category === category);
}

// The groups each kind of project offers (direct instruction): a Content
// Planner its social and performance formats, Other Content the rest, and
// both Other Creative, the catch-all. A post already in a format outside
// its project's list keeps it (see formatsOffLimits).
const DELIVERY_CATEGORIES: Record<"scheduled" | "continuous", readonly string[]> = {
  scheduled: ["Social — organic", "Performance marketing", "General"],
  continuous: ["Amazon", "Email and messaging", "Web and print", "General"],
};

export function categoriesFor(delivery: "scheduled" | "continuous" | null | undefined): readonly string[] {
  return DELIVERY_CATEGORIES[delivery === "continuous" ? "continuous" : "scheduled"];
}

export function formatsFor(delivery: "scheduled" | "continuous" | null | undefined): FormatDefinition[] {
  const cats = categoriesFor(delivery);
  return FORMATS.filter((f) => cats.includes(f.category));
}

// Of a post's formats, those its project no longer offers: shown so they
// can be unticked, never offered to be picked again.
export function formatsOffLimits(ids: string[], delivery: "scheduled" | "continuous" | null | undefined): string[] {
  const offered = new Set(formatsFor(delivery).map((f) => f.id));
  return ids.filter((id) => !offered.has(id));
}

// A post can have several formats (creatives.formats, phase29). The first
// is the main one — it sets the Feed Preview's shape and is what
// creatives.format mirrors. An older row with no formats falls back to its
// single format.
// A post's formats, main first; none yet for an idea or concept made
// without one (phase114).
export function postFormats(c: { format: string | null; formats?: string[] | null }): string[] {
  return c.formats && c.formats.length ? c.formats : c.format ? [c.format] : [];
}

export function formatsLabel(ids: string[]): string {
  return ids.map((id) => formatById(id)?.label ?? id).join(" + ");
}

// Every chosen format's copy fields, once each, in first-seen order.
export function copyFieldsFor(ids: string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    for (const key of formatById(id)?.copyFields ?? []) if (!out.includes(key)) out.push(key);
  }
  return out;
}

// Carousels (phase31). Decided directly: 2–20 slides, with Meta Carousel Ad
// held to Meta's own limit of 10. LinkedIn's document carousel works the
// same way, with slide images rather than a PDF.
const CAROUSEL_MAX_SLIDES: Record<string, number> = { ig_carousel: 20, li_doc: 20, meta_carousel: 10, amz_gallery: 9 };
export const CAROUSEL_MIN_SLIDES = 2;

// The most slides the chosen formats allow, or null when none is a
// carousel. With several carousel formats, the tightest limit wins.
export function carouselMaxSlides(ids: string[]): number | null {
  const limits = ids.map((id) => CAROUSEL_MAX_SLIDES[id]).filter((n): n is number => !!n);
  return limits.length ? Math.min(...limits) : null;
}

// Stories (direct instruction): Instagram Story, Facebook Story and
// WhatsApp Status take a set of 1 to 20, each its own upload and Text on
// Image, as a carousel's slides are.
const STORY_MAX_FRAMES: Record<string, number> = { ig_story: 20, fb_story: 20, wa_status: 20 };
export const STORY_MIN_FRAMES = 1;

// How many pieces a post in these formats is made of, and what each is
// called: a carousel's slides (2 up) or a story's stories (1 up); null
// for a single piece. A carousel among them wins; the tightest limit wins.
export function frameLimits(ids: string[]): { min: number; max: number; noun: "Slide" | "Story" } | null {
  const carousel = carouselMaxSlides(ids);
  if (carousel) return { min: CAROUSEL_MIN_SLIDES, max: carousel, noun: "Slide" };
  const limits = ids.map((id) => STORY_MAX_FRAMES[id]).filter((n): n is number => !!n);
  return limits.length ? { min: STORY_MIN_FRAMES, max: Math.min(...limits), noun: "Story" } : null;
}

// A size, in pixels (phase139).
export interface FormatSize {
  w: number;
  h: number;
}
// A post's chosen sizes, by format (creatives.sizes); a format left out
// uses its default.
export type FormatSizes = Record<string, FormatSize>;

// Each format's sizes to choose from, its default first (decided directly:
// a default per format, changed in the post window under Format). The
// defaults are the prototype's own (its FORMATS' `d`); the rest are the
// platforms' other common sizes. Print is at 300dpi. A format with none
// (Email Campaign, Landing Page, Packaging, Other Creative) is drawn at its
// artwork's own shape unless a custom size is chosen; the text-only ones
// have no size at all.
const SIZE_PRESETS: Record<string, [number, number][]> = {
  ig_feed: [[1080, 1350], [1080, 1080], [1080, 566]],
  ig_carousel: [[1080, 1350], [1080, 1080], [1080, 566]],
  ig_reel: [[1080, 1920]],
  ig_story: [[1080, 1920]],
  fb_feed: [[1200, 630], [1080, 1080], [1080, 1350]],
  fb_story: [[1080, 1920]],
  li_image: [[1200, 627], [1200, 1200], [1080, 1350]],
  li_doc: [[1080, 1080], [1080, 1350]],
  li_video: [[1920, 1080], [1080, 1080], [1080, 1920]],
  yt_video: [[1920, 1080], [3840, 2160]],
  yt_short: [[1080, 1920]],
  yt_thumb: [[1280, 720]],
  wa_status: [[1080, 1920]],
  pin: [[1000, 1500], [1000, 1000], [1000, 2100]],
  meta_feed: [[1080, 1080], [1080, 1350], [1200, 628]],
  meta_story: [[1080, 1920]],
  meta_carousel: [[1080, 1080]],
  g_display: [[300, 250], [728, 90], [160, 600], [320, 50], [336, 280], [300, 600]],
  g_pmax: [[1200, 628], [1200, 1200], [960, 1200]],
  yt_preroll: [[1920, 1080]],
  li_sponsored: [[1200, 627], [1200, 1200]],
  apl_module: [[970, 600], [970, 300], [300, 300]],
  apl_premium: [[1464, 600], [1464, 625]],
  amz_main: [[2000, 2000]],
  amz_info: [[2000, 2000]],
  amz_gallery: [[2000, 2000]],
  amz_sb: [[1200, 628]],
  amz_store: [[1500, 750], [3000, 600]],
  em_banner: [[600, 200], [600, 300]],
  wa_broadcast: [[1080, 1080], [1200, 628]],
  web_hero: [[1920, 800], [1920, 1080], [1440, 600]],
  blog: [[1600, 900], [1200, 630]],
  deck: [[1920, 1080], [1024, 768]],
  ooh: [[4800, 1400], [4800, 2400]],
  print: [[2480, 3508], [3508, 4961], [1748, 2480]],
};

// Names for sizes that have one, so a choice reads as more than numbers.
const SIZE_NAMES: Record<string, string> = {
  "2480x3508": "A4",
  "3508x4961": "A3",
  "1748x2480": "A5",
  "4800x1400": "48 × 14 ft",
  "4800x2400": "48 × 24 ft",
};

// Formats with no artwork at all: no size to choose.
const TEXT_ONLY_FORMAT_IDS = new Set(["g_rsa", "sms", "push"]);

export function hasSize(id: string): boolean {
  return !!formatById(id) && !TEXT_ONLY_FORMAT_IDS.has(id);
}

export function sizePresets(id: string): FormatSize[] {
  return (SIZE_PRESETS[id] ?? []).map(([w, h]) => ({ w, h }));
}

export function defaultSize(id: string): FormatSize | null {
  return sizePresets(id)[0] ?? null;
}

// The size a post is drawn at in this format: its chosen one, else the
// format's default, else none (the artwork's own shape).
export function postSize(id: string | null | undefined, sizes?: FormatSizes | null): FormatSize | null {
  if (!id) return null;
  return sizes?.[id] ?? defaultSize(id);
}

// "1080 × 1350 · 4:5", "1200 × 627 · 1.91:1", "2480 × 3508 · A4".
export function sizeLabel(size: FormatSize): string {
  const name = SIZE_NAMES[`${size.w}x${size.h}`];
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const g = gcd(size.w, size.h);
  const near = (n: number) => String(Math.round(n * 100) / 100);
  const ratio =
    size.w / g <= 32 && size.h / g <= 32
      ? `${size.w / g}:${size.h / g}`
      : size.w >= size.h
        ? `${near(size.w / size.h)}:1`
        : `1:${near(size.h / size.w)}`;
  return `${size.w} × ${size.h} · ${name ?? ratio}`;
}

// A format's shape as a CSS aspect-ratio ("1080 × 1350" → "1080 / 1350"):
// the post's chosen size, else the format's default; square for a format
// with no size, and for a post without a format yet (phase114).
export function aspectRatioCss(id: string | null | undefined, sizes?: FormatSizes | null): string {
  const size = postSize(id, sizes);
  return size ? `${size.w} / ${size.h}` : "1 / 1";
}

// The same shape as a number, width over height.
export function formatRatio(id: string | null | undefined, sizes?: FormatSizes | null): number {
  const [w, h] = aspectRatioCss(id, sizes).split(" / ").map(Number);
  return w / h;
}

// A copy version for the calendar tables' Caption/Copy column (direct
// instruction: every copy field, not just the caption). Only the fields the
// post's formats use, in their order, each set apart by a blank line and
// never labelled (direct instruction: no "Primary Text:" before a
// LinkedIn post's copy). Alt Text isn't shown.
export function copySummaryParts(
  fields: Record<string, string>,
  formatIds: string[],
): { caption: string | null; others: { label: string; text: string }[] } {
  // Not Alt Text (direct instruction: it's for the platform, not the
  // planner).
  const filled = copyFieldsFor(formatIds).filter((key) => key !== "alt" && fields[key]?.trim());
  return {
    caption: filled.includes("caption") ? fields.caption.trim() : null,
    others: filled.filter((key) => key !== "caption").map((key) => ({ label: COPY_FIELD_LABELS[key] ?? key, text: fields[key].trim() })),
  };
}

// The same as one text, as the cell shows it and its Copy button copies.
export function copySummary(fields: Record<string, string>, formatIds: string[]): string {
  const { caption, others } = copySummaryParts(fields, formatIds);
  return [caption, ...others.map((o) => o.text)].filter(Boolean).join("\n\n");
}

// What a post in these formats is expected to have, for the project
// table (direct instruction): a missing one reads Pending, in red; one the
// formats don't take reads as a dash. Matches the New Post window: slides
// for carousels and stories, VO for video, Copy and Alt Text where a
// format has those fields.
export function expectedContent(ids: string[]): { slides: boolean; voiceover: boolean; copy: boolean; alt: boolean } {
  const fields = copyFieldsFor(ids);
  return { slides: !!frameLimits(ids), voiceover: hasVideoFormat(ids), copy: fields.length > 0, alt: fields.includes("alt") };
}
