"use client";

import { useRef, useState } from "react";
import type { HighlightAnchor } from "@/lib/annotations";

interface ExistingHighlight extends HighlightAnchor {
  commentId: string;
}

export function CaptionHighlighter({
  text,
  field,
  highlights,
  highlightedCommentId,
  onSelect,
  onCreate,
}: {
  text: string;
  field: string;
  highlights: ExistingHighlight[];
  highlightedCommentId: string | null;
  onSelect: (commentId: string) => void;
  onCreate: (anchor: HighlightAnchor, body: string) => void;
}) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const [pending, setPending] = useState<{
    start: number;
    end: number;
    quote: string;
  } | null>(null);

  function handleMouseUp() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !spanRef.current || sel.rangeCount === 0) {
      return;
    }
    const range = sel.getRangeAt(0);
    if (!spanRef.current.contains(range.commonAncestorContainer)) return;

    // Character offset within the caption's own text, not the page — a
    // plain DOM measurement, so it needs no viewport/resize handling at all.
    const pre = document.createRange();
    pre.selectNodeContents(spanRef.current);
    pre.setEnd(range.startContainer, range.startOffset);
    const start = pre.toString().length;
    const quote = range.toString();
    if (!quote.trim()) return;

    setPending({ start, end: start + quote.length, quote });
    sel.removeAllRanges();
  }

  const segments = buildSegments(text, highlights);

  return (
    <span>
      <span ref={spanRef} className="hl-target" onMouseUp={handleMouseUp}>
        {segments.map((seg, i) =>
          seg.highlight ? (
            <mark
              key={i}
              className={`hl-mark${
                highlightedCommentId === seg.highlight.commentId ? " act" : ""
              }`}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(seg.highlight!.commentId);
              }}
            >
              {seg.text}
            </mark>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
      </span>

      {pending && (
        <div className="hl-composer" onClick={(e) => e.stopPropagation()}>
          <div className="quoted">&ldquo;{pending.quote}&rdquo;</div>
          <DraftForm
            onCancel={() => setPending(null)}
            onSubmit={(body) => {
              onCreate(
                {
                  type: "highlight",
                  field,
                  start: pending.start,
                  end: pending.end,
                  quote: pending.quote,
                },
                body,
              );
              setPending(null);
            }}
          />
        </div>
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

function DraftForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (body: string) => void;
}) {
  const [body, setBody] = useState("");
  return (
    <>
      <textarea
        className="bin"
        rows={2}
        autoFocus
        placeholder="Comment on this text…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="cf">
        <button type="button" className="btn sm" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn primary sm"
          disabled={!body.trim()}
          onClick={() => onSubmit(body.trim())}
        >
          Post
        </button>
      </div>
    </>
  );
}
