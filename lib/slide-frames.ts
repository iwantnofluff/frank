// What the arrows step through: one place per slide, in order, so a
// 2-slide carousel with only slide 2 uploaded still shows two slides —
// the first saying it has no image yet — rather than one, with no arrows.
// No images at all gives an empty list (the whole post shows "No artwork
// yet"). Position n is always index n - 1.
export function slideFrames<T extends { position: number }>(slides: T[], slideCount: number | null | undefined): (T | null)[] {
  if (!slides.length) return [];
  const byPosition = new Map(slides.map((s) => [s.position, s]));
  const length = Math.max(slideCount ?? 1, ...slides.map((s) => s.position));
  return Array.from({ length }, (_, i) => byPosition.get(i + 1) ?? null);
}
