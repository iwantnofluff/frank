// Comment anchor shapes (schema doc, "Comment anchors"). Stored as-is in
// comments.anchor — a jsonb blob with a type discriminator, not five sets
// of nullable columns.

export interface PinAnchor {
  type: "pin";
  x: number; // 0-1, normalised so it survives resizing
  y: number;
  n: number;
  // Which carousel slide it sits on (its position, 1-based). Absent on
  // anything placed before carousels, which reads as slide 1.
  slide?: number;
  // For a video: the moment it was placed, in seconds (phase34).
  t?: number;
}

export interface RegionAnchor {
  type: "region";
  x: number;
  y: number;
  w: number;
  h: number;
  n: number;
  slide?: number; // as PinAnchor.slide
  t?: number; // as PinAnchor.t
}

// A comment at a moment in a video, with no pin or box (phase34) — what a
// guest on the review link leaves, or anyone commenting while paused.
export interface TimeAnchor {
  type: "time";
  t: number;
  slide?: number; // a carousel's video slide, as PinAnchor.slide
}

export interface HighlightAnchor {
  type: "highlight";
  field: string; // 'caption' | 'text_on_image' etc.
  start: number;
  end: number;
  quote: string;
}

export type Anchor = PinAnchor | RegionAnchor | HighlightAnchor | TimeAnchor;

export function isTimeAnchor(a: unknown): a is TimeAnchor {
  return !!a && typeof a === "object" && (a as Anchor).type === "time";
}

// The moment in a video a comment is about, if it's about one.
export function commentTime(a: unknown): number | null {
  if (!a || typeof a !== "object") return null;
  const t = (a as { t?: unknown }).t;
  return typeof t === "number" && t >= 0 ? t : null;
}

// 75.4 → "1:15".
export function formatVideoTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function isPinAnchor(a: unknown): a is PinAnchor {
  return !!a && typeof a === "object" && (a as Anchor).type === "pin";
}

export function isRegionAnchor(a: unknown): a is RegionAnchor {
  return !!a && typeof a === "object" && (a as Anchor).type === "region";
}

export function isHighlightAnchor(a: unknown): a is HighlightAnchor {
  return !!a && typeof a === "object" && (a as Anchor).type === "highlight";
}
