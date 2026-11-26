"use client";

import { useRef } from "react";
import { useViewportFit } from "@/hooks/use-viewport-fit";

// A copy button's whole message, as it will paste (direct instruction), in
// the caption hover's card. Read only: it never takes the pointer, so it
// can't hold itself open over the buttons.
export function MessagePreview({ text, anchorRect }: { text: string; anchorRect: DOMRect }) {
  const ref = useRef<HTMLDivElement>(null);
  useViewportFit(ref, anchorRect, { side: "below", gap: 6 });
  return (
    <div ref={ref} className="copypop on msgpop" role="tooltip">
      <div className="cp-row">{text}</div>
    </div>
  );
}
