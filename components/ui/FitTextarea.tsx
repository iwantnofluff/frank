"use client";

import { forwardRef, useCallback, useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

// The post window's long words (the VO, Text on Image, the Caption): as
// tall as their words, from three lines up to the long-text height, then
// scrolling inside (direct instruction: the big box is for long text only).
// Dragged taller by hand, it stays as dragged.
const MAX = 185;

export const FitTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function FitTextarea(
  { value, rows = 3, ...props },
  outer,
) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  // Dragged by hand: left as it is.
  const dragged = useRef(false);
  // The height last set here, to tell a drag from it.
  const set = useRef(0);
  const fit = useCallback(() => {
    const el = inner.current;
    if (!el || dragged.current) return;
    el.style.height = "auto";
    const border = el.offsetHeight - el.clientHeight;
    set.current = Math.min(el.scrollHeight + border, MAX);
    el.style.height = `${set.current}px`;
  }, []);
  useLayoutEffect(fit, [value, fit]);

  return (
    <textarea
      {...props}
      rows={rows}
      value={value}
      ref={(el) => {
        inner.current = el;
        if (typeof outer === "function") outer(el);
        else if (outer) outer.current = el;
      }}
      onPointerUp={(e) => {
        // A drag of the corner leaves its own height.
        if (set.current && Math.abs(e.currentTarget.offsetHeight - set.current) > 1) dragged.current = true;
        props.onPointerUp?.(e);
      }}
    />
  );
});
