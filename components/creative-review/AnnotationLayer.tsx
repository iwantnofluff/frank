"use client";

import { useRef, useState } from "react";
import type { PinAnchor, RegionAnchor } from "@/lib/annotations";
import { CommentDraftForm } from "./CommentDraftForm";

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
// The comment box's width (as .annot-composer).
const COMPOSER_W = 240;

export function AnnotationLayer({
  mode,
  pins,
  regions,
  nextNumber,
  highlightedCommentId,
  showVisibilityToggle,
  onSelect,
  onCreate,
}: {
  mode: ToolMode;
  pins: PinMarker[];
  regions: RegionMarker[];
  nextNumber: number;
  highlightedCommentId: string | null;
  showVisibilityToggle: boolean;
  onSelect: (commentId: string) => void;
  onCreate: (anchor: PinAnchor | RegionAnchor, body: string, visibility: "private" | "public") => void;
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
            // Centred under the pin, or under the middle of the area, then
            // kept inside the artwork's own edges (direct instruction: near
            // the right edge it poked out past the phone's screen, and its
            // focus scrolled the whole post sideways). Measured, so it
            // holds at any size the artwork is drawn; 8px clear of each edge.
            left: `clamp(8px, calc(${(draft.type === "pin" ? draft.x : draft.x + draft.w / 2) * 100}% - ${COMPOSER_W / 2}px), calc(100% - ${COMPOSER_W + 8}px))`,
            top: `${(draft.type === "pin" ? draft.y : draft.y + (draft.y > 0.75 ? 0 : draft.h)) * 100}%`,
            width: COMPOSER_W,
            maxWidth: "calc(100% - 16px)",
            transform: `translateY(${draft.y > 0.75 ? "calc(-100% - 12px)" : "12px"})`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <CommentDraftForm
            showVisibilityToggle={showVisibilityToggle}
            onCancel={() => setDraft(null)}
            onSubmit={(body, visibility) => {
              onCreate(draft, body, visibility);
              setDraft(null);
            }}
          />
        </div>
      )}
    </div>
  );
}
