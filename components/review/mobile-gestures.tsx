"use client";

import { useRef } from "react";

// A sideways swipe of at least 60px, clearly more across than down: -1 for
// a swipe right (the post before), 1 for a swipe left (the next one).
// `allowed` says whether a swipe starting on that element counts.
export function useSwipe(onSwipe: (dir: -1 | 1) => void, allowed: (target: EventTarget) => boolean) {
  const from = useRef<{ x: number; y: number } | null>(null);
  return {
    start: (e: React.TouchEvent) => {
      const t = e.touches[0];
      from.current = t && allowed(e.target) ? { x: t.clientX, y: t.clientY } : null;
    },
    end: (e: React.TouchEvent) => {
      const f = from.current;
      from.current = null;
      const t = e.changedTouches[0];
      if (!f || !t) return;
      const dx = t.clientX - f.x;
      const dy = t.clientY - f.y;
      if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.5) onSwipe(dx < 0 ? 1 : -1);
    },
  };
}

// The comment icon under a post (direct instruction): goes to the comments
// and the comment box, as Instagram's does. On a phone, scrolls to the
// first comment (or the box when there are none); either way the box is
// ready to type in.
export function CommentJump({ variant }: { variant: "mobile" | "desktop" }) {
  return (
    <button
      type="button"
      className="ig-act-btn"
      aria-label="Go to comments"
      onClick={() => {
        const box = document.querySelector<HTMLTextAreaElement>(variant === "mobile" ? ".m-bar textarea" : ".dk-foot textarea");
        const first = variant === "mobile" ? document.querySelector(".m-cmt") : null;
        (first ?? box)?.scrollIntoView({ behavior: "smooth", block: "start" });
        box?.focus({ preventScroll: true });
      }}
    >
      <svg viewBox="0 0 24 24">
        <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.8-.9L3 20.5l1.5-4.4A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z" />
      </svg>
    </button>
  );
}
