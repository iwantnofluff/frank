// Text on Image is one entry per slide, so a blank in the middle keeps its
// place (slide 2 empty, slide 3 written). Only blanks at the end — fields
// shown but never filled in — are dropped before saving.
export function tidySlideText(values: string[]): string[] {
  const out = values.map((v) => v.trim());
  while (out.length && !out[out.length - 1]) out.pop();
  return out;
}

// The fields to show: exactly one per slide for a carousel; otherwise
// whatever has been written, with at least one open field.
export function slideFields(values: string[], slideCount: number | null): string[] {
  if (slideCount) return Array.from({ length: slideCount }, (_, i) => values[i] ?? "");
  return values.length ? values : [""];
}
