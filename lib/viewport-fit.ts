export interface AnchorBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// "below": under the trigger, flipping above it when there's more room
// there — menus and click-triggered popovers. "beside": to the right of the
// trigger, flipping to its left — the creative hover preview.
export type FitPlacement = {
  side: "below" | "beside";
  align?: "start" | "end";
  gap?: number;
};

export interface FitResult {
  left: number;
  top: number;
  // Only set when the popover is taller than the room it has — it then
  // scrolls inside rather than running off-screen.
  maxHeight: number | null;
}

export const VIEWPORT_MARGIN = 8;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

// Pure — takes the popover's real measured size, not a guess. Every
// popover here used to hardcode its own height (340px for the creative
// preview, which is taller than that once its caption loads), and one
// wrong guess is exactly how a popover ran off the bottom of the screen.
export function computeFit(input: {
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  anchor: AnchorBox;
  placement: FitPlacement;
}): FitResult {
  const { width: w, height: h, viewportWidth: vw, viewportHeight: vh, anchor, placement } = input;
  const m = VIEWPORT_MARGIN;
  let left: number;
  let top: number;
  let maxHeight: number | null = null;

  if (placement.side === "beside") {
    const gap = placement.gap ?? 10;
    left = anchor.right + gap;
    if (left + w > vw - m) left = anchor.left - gap - w;
    if (h > vh - 2 * m) {
      top = m;
      maxHeight = vh - 2 * m;
    } else {
      top = clamp(anchor.top - gap, m, vh - h - m);
    }
  } else {
    const gap = placement.gap ?? 6;
    left = placement.align === "end" ? anchor.right - w : anchor.left;
    const spaceBelow = vh - anchor.bottom - gap - m;
    const spaceAbove = anchor.top - gap - m;
    if (h <= spaceBelow) {
      top = anchor.bottom + gap;
    } else if (h <= spaceAbove) {
      top = anchor.top - gap - h;
    } else if (spaceBelow >= spaceAbove) {
      top = anchor.bottom + gap;
      maxHeight = spaceBelow;
    } else {
      top = m;
      maxHeight = spaceAbove;
    }
  }

  return { left: clamp(left, m, vw - w - m), top, maxHeight };
}
