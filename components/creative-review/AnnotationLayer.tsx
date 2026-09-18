"use client";

import { useRef, useState } from "react";
import type { PinAnchor, RegionAnchor } from "@/lib/annotations";

export type ToolMode = "pin" | "region" | null;

interface PinMarker extends PinAnchor {
  commentId: string;
}
interface RegionMarker extends RegionAnchor {
  commentId: string;
}

// Coordinates are computed from getBoundingClientRect() at the moment of
// each event, and everything is rendered back out as a percentage of the
// same container — never a cached pixel value — so a window resize between
// dropping a pin and viewing it later can't put it in the wrong place.
export function AnnotationLayer({
  mode,
  pins,
  regions,
  nextNumber,
  highlightedCommentId,
  onSelect,
  onCreate,
}: {
  mode: ToolMode;
  pins: PinMarker[];
  regions: RegionMarker[];
  nextNumber: number;
  highlightedCommentId: string | null;
  onSelect: (commentId: string) => void;
  onCreate: (anchor: PinAnchor | RegionAnchor, body: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  const [draft, setDraft] = useState<PinAnchor | RegionAnchor | null>(null);

  function normalise(clientX: number, clientY: number) {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  }

  function handleClick(e: React.MouseEvent) {
    if (mode !== "pin" || draft) return;
    const { x, y } = normalise(e.clientX, e.clientY);
    setDraft({ type: "pin", x, y, n: nextNumber });
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (mode !== "region" || draft) return;
    dragStart.current = normalise(e.clientX, e.clientY);
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dragStart.current) return;
    const p = normalise(e.clientX, e.clientY);
    setDragRect({
      x: Math.min(dragStart.current.x, p.x),
      y: Math.min(dragStart.current.y, p.y),
      w: Math.abs(p.x - dragStart.current.x),
      h: Math.abs(p.y - dragStart.current.y),
    });
  }

  function handleMouseUp() {
    if (dragStart.current && dragRect && dragRect.w > 0.02 && dragRect.h > 0.02) {
      setDraft({ type: "region", ...dragRect, n: nextNumber });
    }
    dragStart.current = null;
    setDragRect(null);
  }

  return (
    <div
      ref={containerRef}
      className={`annot-layer${mode ? " active" : ""}`}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {pins.map((p) => (
        <button
          key={p.commentId}
          type="button"
          className={`annot-pin${highlightedCommentId === p.commentId ? " act" : ""}`}
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(p.commentId);
          }}
        >
          {p.n}
        </button>
      ))}

      {regions.map((r) => (
        <button
          key={r.commentId}
          type="button"
          className={`annot-region${highlightedCommentId === r.commentId ? " act" : ""}`}
          style={{
            left: `${r.x * 100}%`,
            top: `${r.y * 100}%`,
            width: `${r.w * 100}%`,
            height: `${r.h * 100}%`,
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(r.commentId);
          }}
        >
          <span className="annot-n">{r.n}</span>
        </button>
      ))}

      {dragRect && (
        <div
          className="annot-region drawing"
          style={{
            left: `${dragRect.x * 100}%`,
            top: `${dragRect.y * 100}%`,
            width: `${dragRect.w * 100}%`,
            height: `${dragRect.h * 100}%`,
          }}
        />
      )}

      {draft && (
        <div
          className="annot-composer"
          style={{
            left: `${(draft.type === "pin" ? draft.x : draft.x + draft.w) * 100}%`,
            top: `${(draft.type === "pin" ? draft.y : draft.y) * 100}%`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <DraftForm
            onCancel={() => setDraft(null)}
            onSubmit={(body) => {
              onCreate(draft, body);
              setDraft(null);
            }}
          />
        </div>
      )}
    </div>
  );
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
        placeholder="Add a comment…"
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
