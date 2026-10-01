import { carouselMaxSlides, formatById } from "./formats.ts";

// Whether a format is made from images or video. The prototype's catalog
// doesn't say, so this is a reading of its formats: "either" (stories,
// Performance Max, Other Creative) never conflicts, and "text" is the
// formats with no artwork at all. docs/parity-gaps.md.
const VIDEO = new Set(["ig_reel", "li_video", "yt_video", "yt_short", "yt_preroll"]);
const EITHER = new Set(["ig_story", "fb_story", "wa_status", "meta_story", "g_pmax", "general"]);
const TEXT = new Set(["g_rsa", "sms", "push"]);

export type MediaKind = "image" | "video" | "either" | "text";

export function mediaKind(id: string): MediaKind {
  if (VIDEO.has(id)) return "video";
  if (EITHER.has(id)) return "either";
  if (TEXT.has(id)) return "text";
  return "image";
}

const KIND_WORD: Record<MediaKind, string> = { image: "an image", video: "a video", either: "", text: "text only" };

function fixedRatio(id: string): string | null {
  const r = formatById(id)?.aspectRatio ?? "";
  return /^\d+(\.\d+)?:\d+(\.\d+)?$/.test(r) ? r : null;
}

function label(id: string) {
  return formatById(id)?.label ?? id;
}

// Why a post's uploaded artwork no longer fits after a format change —
// empty when it still fits. Decided directly, each of these warns before
// the artwork is removed: carousel to single or back, image to video or
// back, a different shape (both fixed ratios), and fewer slides than were
// uploaded. Compares the main (first) format; carousel-ness counts any.
export function artworkChangeReasons(
  before: { formats: string[]; slideCount: number | null },
  after: { formats: string[]; slideCount: number | null },
  uploadedSlides: number,
): string[] {
  const reasons: string[] = [];
  const a = before.formats[0];
  const b = after.formats[0];
  const wasCarousel = carouselMaxSlides(before.formats) !== null;
  const isCarousel = carouselMaxSlides(after.formats) !== null;

  if (wasCarousel !== isCarousel) {
    reasons.push(
      wasCarousel
        ? `${label(a)} is a carousel and ${label(b)} is a single piece.`
        : `${label(a)} is a single piece and ${label(b)} is a carousel.`,
    );
  } else if (isCarousel && after.slideCount !== null && uploadedSlides > after.slideCount) {
    reasons.push(`The carousel goes down to ${after.slideCount} slides, and ${uploadedSlides} are uploaded.`);
  }

  const ka = mediaKind(a);
  const kb = mediaKind(b);
  if (ka !== kb && ka !== "either" && kb !== "either") {
    reasons.push(`${label(a)} is ${KIND_WORD[ka]} and ${label(b)} is ${KIND_WORD[kb]}.`);
  }

  const ra = fixedRatio(a);
  const rb = fixedRatio(b);
  if (ra && rb && ra !== rb) reasons.push(`${label(a)} is ${ra} and ${label(b)} is ${rb}.`);

  return reasons;
}
