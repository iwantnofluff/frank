"use client";

import { useEffect, useRef, useState } from "react";

// How long a closing menu stays on screen to animate out: the closing
// transition's own length (--dur-close in app/globals.css).
export const CLOSE_MS = 170;

// Open and close motion for anything that mounts on a condition (direct
// instruction: menus, drawers and the review page's section menu animate
// both ways, opening slower with a decelerate curve, closing faster with
// an accelerate one). `value` is what the element needs to show (an
// anchor rect, or true); null or false means closed.
//
// - `shown` keeps the last value while the element animates out, so the
//   caller keeps rendering it (in place) until it's gone.
// - `isOpen` becomes true one frame after it appears and false the moment
//   it closes: put `is-open` on the element from it, so the CSS transition
//   on the base class runs both ways.
export function usePresence<T>(value: T | null | false | undefined): { shown: T | null; isOpen: boolean } {
  const live = value || null;
  // The value kept on screen while closing, and the one that has had its
  // first frame (so the opening transition has a start to run from).
  const [shown, setShown] = useState<T | null>(live);
  const [openedFor, setOpenedFor] = useState<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (live && shown !== live) setShown(live);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (live) {
      const frame = requestAnimationFrame(() => setOpenedFor(live));
      return () => cancelAnimationFrame(frame);
    }
    // Gone once closed, and forgotten, so reopening runs the transition
    // again (a true opens as true the next time, too).
    timer.current = setTimeout(() => {
      setShown(null);
      setOpenedFor(null);
    }, CLOSE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [live]);

  // Open once its first frame has passed; closed the moment it closes.
  return { shown: live ?? shown, isOpen: !!live && openedFor === live };
}
