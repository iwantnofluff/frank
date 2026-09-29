"use client";

import { useLayoutEffect, type RefObject } from "react";
import { computeFit, type FitPlacement } from "@/lib/viewport-fit";

// Keeps a fixed-position popover fully on-screen, measured from its real
// rendered size rather than a guessed one. Runs before paint (no visible
// jump), and again whenever the popover's own size changes — the creative
// preview, for one, grows after it opens once its caption and comments
// load — or the window is resized.
//
// Writes left/top/max-height straight onto the element rather than through
// React state: nothing else reads them, and it avoids a second render just
// to reposition. Uses offsetWidth/offsetHeight, which ignore transforms, so
// the opening animation's few pixels of movement don't skew the measurement.
export function useViewportFit(
  ref: RefObject<HTMLElement | null>,
  anchor: DOMRect | null,
  placement: FitPlacement,
) {
  const { side, align, gap } = placement;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !anchor) return;

    function apply() {
      if (!el || !anchor) return;
      // Measure at natural height (any CSS max-height still applies), not a
      // cap left over from a previous pass.
      el.style.maxHeight = "";
      el.style.overflowY = "";
      const fit = computeFit({
        width: el.offsetWidth,
        height: el.offsetHeight,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        anchor,
        placement: { side, align, gap },
      });
      el.style.left = `${fit.left}px`;
      el.style.top = `${fit.top}px`;
      if (fit.maxHeight !== null) {
        el.style.maxHeight = `${fit.maxHeight}px`;
        el.style.overflowY = "auto";
      }
    }

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    window.addEventListener("resize", apply);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", apply);
    };
  }, [ref, anchor, side, align, gap]);
}
