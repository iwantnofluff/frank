"use client";

import { useEffect } from "react";

type Edge = "left" | "right" | "top" | "bottom";

// The edge of the button nearest the pointer as it crosses it.
function edgeOf(el: Element, x: number, y: number): Edge {
  const r = el.getBoundingClientRect();
  const d = { left: x - r.left, right: r.right - x, top: y - r.top, bottom: r.bottom - y };
  return (Object.keys(d) as Edge[]).reduce((a, b) => (d[b] < d[a] ? b : a));
}

// Every button's hover colour swipes in from the edge the pointer came in
// by, and out by the edge it leaves (direct instruction), at the site's
// own hover speed (app/globals.css, .btn::before). One listener for the
// whole page, so every .btn gets it without each one knowing. Touch taps
// and disabled buttons don't.
export function useButtonSwipe() {
  useEffect(() => {
    function over(e: PointerEvent) {
      if (e.pointerType === "touch") return;
      const btn = (e.target as Element | null)?.closest?.(".btn");
      if (!(btn instanceof HTMLElement) || btn.contains(e.relatedTarget as Node | null)) return;
      if ((btn as HTMLButtonElement).disabled) return;
      // Snap the hidden fill to the new edge first, so it never slides in
      // from the side it last left by.
      btn.classList.add("swipe-snap");
      btn.dataset.from = edgeOf(btn, e.clientX, e.clientY);
      void btn.offsetWidth;
      btn.classList.remove("swipe-snap");
      btn.classList.add("swipe");
    }
    function out(e: PointerEvent) {
      const btn = (e.target as Element | null)?.closest?.(".btn");
      if (!(btn instanceof HTMLElement) || btn.contains(e.relatedTarget as Node | null)) return;
      if (!btn.classList.contains("swipe")) return;
      btn.dataset.from = edgeOf(btn, e.clientX, e.clientY);
      btn.classList.remove("swipe");
    }
    document.addEventListener("pointerover", over);
    document.addEventListener("pointerout", out);
    return () => {
      document.removeEventListener("pointerover", over);
      document.removeEventListener("pointerout", out);
    };
  }, []);
}
