"use client";

import { useEffect } from "react";

// A window opened on a click (the post editor, Share) is loaded on demand
// (lazyWindow), so it isn't in the page's first download; this fetches
// its code once the page has settled, so the click still opens it at once.
// The loaders are module-level constants, so they never change.
export function useWarmUp(loaders: readonly (() => Promise<unknown>)[]) {
  useEffect(() => {
    const t = setTimeout(() => {
      for (const load of loaders) void load().catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [loaders]);
}
