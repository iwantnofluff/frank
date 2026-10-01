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
}

export interface RegionAnchor {
  type: "region";
  x: number;
  y: number;
  w: number;
  h: number;
  n: number;
  slide?: number; // as PinAnchor.slide
}

export interface HighlightAnchor {
  type: "highlight";
  field: string; // 'caption' | 'text_on_image' etc.
  start: number;
  end: number;
  quote: string;
}

export type Anchor = PinAnchor | RegionAnchor | HighlightAnchor;

export function isPinAnchor(a: unknown): a is PinAnchor {
  return !!a && typeof a === "object" && (a as Anchor).type === "pin";
}

export function isRegionAnchor(a: unknown): a is RegionAnchor {
  return !!a && typeof a === "object" && (a as Anchor).type === "region";
}

export function isHighlightAnchor(a: unknown): a is HighlightAnchor {
  return !!a && typeof a === "object" && (a as Anchor).type === "highlight";
}
