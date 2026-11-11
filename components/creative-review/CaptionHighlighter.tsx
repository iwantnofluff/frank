"use client";

import { useRef } from "react";
import type { HighlightAnchor } from "@/lib/annotations";

interface ExistingHighlight extends HighlightAnchor {
  commentId: string;
}

// Words picked go to the comments' own box (direct instruction: no small
// box of their own), marked here until the comment is posted.
const DRAFT = "draft";

export function CaptionHighlighter({
  text,
  field,
  highlights,
  highlightedCommentId,
  draft,
  onSelect,
  onPlace,
}: {
  text: string;
  field: string;
  highlights: ExistingHighlight[];
  highlightedCommentId: string | null;
  // The words picked and not yet commented on, when they're in this text.
  draft: HighlightAnchor | null;
  onSelect: (commentId: string) => void;
  onPlace: (anchor: HighlightAnchor) => void;
}) {
  const spanRef = useRef<HTMLSpanElement>(null);

  function handleMouseUp() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !spanRef.current || sel.rangeCount === 0) {
      return;
    }
    // Only the part of the selection that's in the text: a drag often
    // runs on past its last word.
    const span = spanRef.current;
    const range = sel.getRangeAt(0).cloneRange();
    if (!range.intersectsNode(span)) return;
    if (!span.contains(range.startContainer)) range.setStart(span, 0);
    if (!span.contains(range.endContainer)) range.setEnd(span, span.childNodes.length);

    // Character offset within the caption's own text, not the page — a
    // plain DOM measurement, so it needs no viewport/resize handling at all.
    const pre = document.createRange();
    pre.selectNodeContents(span);
    pre.setEnd(range.startContainer, range.startOffset);
    const start = pre.toString().length;
    const quote = range.toString();
    if (!quote.trim()) return;

    onPlace({ type: "highlight", field, start, end: start + quote.length, quote });
    sel.removeAllRanges();
  }

  // A drag that starts on the words counts wherever it's let go, on them
  // or past them.
  function handleMouseDown() {
    document.addEventListener("mouseup", () => setTimeout(handleMouseUp), { once: true });
  }

  const segments = buildSegments(
    text,
    draft && draft.field === field ? [...highlights.filter((h) => h.end <= draft.start || h.start >= draft.end), { ...draft, commentId: DRAFT }] : highlights,
  );

  return (
    <span ref={spanRef} className="hl-target" onMouseDown={handleMouseDown} onMouseUp={handleMouseUp}>
      {segments.map((seg, i) =>
        seg.highlight ? (
          <mark
            key={i}
            className={`hl-mark${
              highlightedCommentId === seg.highlight.commentId || seg.highlight.commentId === DRAFT ? " act" : ""
            }`}
            onClick={(e) => {
              e.stopPropagation();
              if (seg.highlight!.commentId !== DRAFT) onSelect(seg.highlight!.commentId);
            }}
          >
            {seg.text}
          </mark>
        ) : (
          <span key={i}>{seg.text}</span>
        ),
      )}
    </span>
  );
}

function buildSegments(text: string, highlights: ExistingHighlight[]) {
  const sorted = [...highlights].sort((a, b) => a.start - b.start);
  const segments: { text: string; highlight: ExistingHighlight | null }[] = [];
  let cursor = 0;

  for (const h of sorted) {
    if (h.start < cursor || h.start >= h.end || h.end > text.length) continue; // skip overlaps/out-of-range
    if (h.start > cursor) segments.push({ text: text.slice(cursor, h.start), highlight: null });
    segments.push({ text: text.slice(h.start, h.end), highlight: h });
    cursor = h.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), highlight: null });

  return segments;
}
