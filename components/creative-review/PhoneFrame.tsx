"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { TabletOrientation } from "@/lib/post-templates";

// The phone's drawn size and the most it's scaled on screen: 10% up from
// the 0.85 it had (direct instruction). An iPhone 15 (direct instruction:
// true to the real phone): a 393 × 852 screen inside a 12px frame.
const HEIGHT = 876;
const MOST = 0.935;
const LEAST = 0.6;
// The space kept above it (margin-top), and below so it isn't flush.
const ABOVE = 20;
const BELOW = 16;
// Full size (direct instruction: a video small on a laptop): as tall as the
// window allows, less a margin, up to this.
const FILL_MOST = 1.6;
const FILL_MARGIN = 48;
// An iPad (decided directly: Other Content's formats), a fixed size as a
// real one is: an 11-inch iPad's 1180 × 820 screen inside an 18px frame, on
// its side or upright. It also fits the width it has, and can go smaller
// than a phone. The status bar takes the screen's top 22px.
const TABLET_SCREEN_W = 1180;
const TABLET_SCREEN_H = 820;
const TABLET_BEZEL = 18;
const TABLET_LEAST = 0.3;

const TABLET_STATUS = 22;

// A phone around the Feed Preview and the Content post (direct
// instruction): the outline, notch and side buttons drawn in CSS so they
// stay crisp; the screen's contents fill it and scroll within it. It
// scales down to fit the canvas's height, so its bottom is never cut off
// on a shorter window. zoom keeps layout and hit-testing in step, unlike a
// transform.
export function PhoneFrame({
  children,
  reserve = 0,
  scale = 1,
  fill = false,
  device = "phone",
  reserveX = 0,
  orientation,
}: {
  children: ReactNode;
  // Height kept free beside it in the space it fits (a title above, a note
  // below), on the review link (direct instruction: the Reel fits the screen).
  reserve?: number;
  // A share of its usual size (direct instruction: 0.85 on a post's page,
  // to make room for the previous and next post beside it).
  scale?: number;
  // Shown full size over the page: fitted to the window instead.
  fill?: boolean;
  // A phone, or an iPad.
  device?: "phone" | "tablet";
  // An iPad's: width kept free beside it (the arrows to the posts either
  // side).
  reserveX?: number;
  // Which way an iPad is held (lib/post-templates.ts tabletOrientation),
  // given the shape of the artwork on it once that's loaded.
  orientation?: (artRatio: number | null) => TabletOrientation;
}) {
  const tablet = device === "tablet";
  const ref = useRef<HTMLDivElement>(null);
  // The artwork's own shape, read from its image: which way the iPad turns
  // for it, and how large it can be drawn whole (--art-r).
  const [artRatio, setArtRatio] = useState<number | null>(null);
  useEffect(() => {
    const frame = ref.current;
    if (!tablet || !frame) return;
    const read = () => {
      const img = frame.querySelector<HTMLImageElement>(".ig-media img");
      const next = img && img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : null;
      setArtRatio((prev) => (prev === next ? prev : next));
    };
    read();
    // load doesn't bubble, but is seen on its way down.
    frame.addEventListener("load", read, true);
    return () => frame.removeEventListener("load", read, true);
  });
  const portrait = tablet && orientation?.(artRatio) === "portrait";
  const screen = portrait ? { w: TABLET_SCREEN_H, h: TABLET_SCREEN_W } : { w: TABLET_SCREEN_W, h: TABLET_SCREEN_H };
  const frameW = screen.w + TABLET_BEZEL * 2;
  const frameH = screen.h + TABLET_BEZEL * 2;
  const height = tablet ? frameH : HEIGHT;
  const least = tablet ? TABLET_LEAST : LEAST;
  const [zoom, setZoom] = useState(MOST * scale);

  useLayoutEffect(() => {
    if (fill) {
      const fitWindow = () =>
        setZoom(
          Math.max(
            least,
            Math.min(
              FILL_MOST,
              (window.innerHeight - FILL_MARGIN * 2) / height,
              tablet ? (window.innerWidth - FILL_MARGIN * 2) / frameW : Infinity,
            ),
          ),
        );
      fitWindow();
      window.addEventListener("resize", fitWindow);
      return () => window.removeEventListener("resize", fitWindow);
    }
    // The Review page's canvas, or the review link's desktop middle.
    const canvas = ref.current?.closest(".canvas, .dk-main");
    if (!(canvas instanceof HTMLElement)) return;
    function fit() {
      const style = getComputedStyle(canvas as HTMLElement);
      const room =
        (canvas as HTMLElement).clientHeight -
        parseFloat(style.paddingTop) -
        parseFloat(style.paddingBottom) -
        ABOVE -
        BELOW -
        reserve;
      const across = (canvas as HTMLElement).clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - reserveX;
      setZoom(Math.max(least * scale, Math.min(MOST * scale, room / height, tablet ? across / frameW : Infinity)));
    }
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [reserve, reserveX, scale, height, frameW, least, tablet, fill]);

  return (
    // --pf-zoom lets text inside be sized as seen, not as drawn.
    <div
      className={`phoneframe${tablet ? " tablet" : ""}${portrait ? " portrait" : ""}`}
      ref={ref}
      style={{ zoom, "--pf-zoom": zoom, ...(tablet
          ? {
              width: frameW,
              height: frameH,
              // The room under the status bar, and the artwork's shape.
              "--screen-w": `${screen.w}px`,
              "--screen-h": `${screen.h - TABLET_STATUS}px`,
              "--art-r": artRatio ?? 1,
            }
          : {}) } as CSSProperties}
    >
      <span className="pf-notch" aria-hidden="true" />
      {/* An iPhone 15's: the side button on the right; the Action button
          and the two volume buttons on the left. */}
      <span className="pf-btn pf-btn-side" aria-hidden="true" />
      <span className="pf-btn pf-btn-action" aria-hidden="true" />
      <span className="pf-btn pf-btn-volup" aria-hidden="true" />
      <span className="pf-btn pf-btn-voldown" aria-hidden="true" />
      <div className="pf-screen">{children}</div>
    </div>
  );
}
