"use client";

import { useEffect, useRef } from "react";

// The end of a scrolling grid (phase54's live feed): when it comes into
// view, the next page loads, until there's none. A full-width row of the
// grid, nearly invisible; says "Loading…" while a page is on its way.
export function LoadMore({ hasMore, loading, onMore }: { hasMore: boolean; loading: boolean; onMore: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !hasMore || loading) return;
    // A little before the end, so the next page is usually there already.
    const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && onMore(), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, onMore]);
  if (!hasMore && !loading) return null;
  return (
    <div ref={ref} className="feedmore">
      {loading ? "Loading…" : ""}
    </div>
  );
}
