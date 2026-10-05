"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

// The phone's drawn size (the user's iPhone template) and the most it's
// scaled on screen: 10% up from the 0.85 it had (direct instruction).
const HEIGHT = 876;
const MOST = 0.935;
const LEAST = 0.6;
// The space kept above it (margin-top), and below so it isn't flush.
const ABOVE = 20;
const BELOW = 16;

// A phone around the Feed Preview and the Content post (direct
// instruction): the outline, notch and side buttons drawn in CSS so they
// stay crisp; the screen's contents fill it and scroll within it. It
// scales down to fit the canvas's height, so its bottom is never cut off
// on a shorter window. zoom keeps layout and hit-testing in step, unlike a
// transform.
export function PhoneFrame({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(MOST);

  useLayoutEffect(() => {
    const canvas = ref.current?.closest(".canvas");
    if (!(canvas instanceof HTMLElement)) return;
    function fit() {
      const style = getComputedStyle(canvas as HTMLElement);
      const room =
        (canvas as HTMLElement).clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - ABOVE - BELOW;
      setZoom(Math.max(LEAST, Math.min(MOST, room / HEIGHT)));
    }
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="phoneframe" ref={ref} style={{ zoom }}>
      <span className="pf-notch" aria-hidden="true" />
      <span className="pf-btn pf-btn1" aria-hidden="true" />
      <span className="pf-btn pf-btn2" aria-hidden="true" />
      <div className="pf-screen">{children}</div>
    </div>
  );
}
