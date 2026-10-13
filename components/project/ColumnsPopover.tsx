"use client";

import { useEffect, useRef } from "react";
import { useViewportFit } from "@/hooks/use-viewport-fit";
import { ColumnEditor, type EditorColumn } from "@/components/project/ColumnEditor";

export interface ToggleableColumn {
  key: string;
  label: string;
  sub: string;
}

// Ports frank-prototype.html's #colpop (renderColPicker), now the same
// column editor as the New Project window's Columns step (direct
// instruction): drag to reorder, tick to show, each column's type beside
// it, renaming for Owners and Admins, and + Add Column below. Order and
// what's shown are the view's (saved as a view); a rename is the
// project's. Week/Date/Day aren't listed: they're frozen and always on.
export function ColumnsPopover({
  anchorRect,
  isOpen = true,
  columns,
  visibility,
  frozenCount,
  onToggle,
  onToggleAll,
  onReorder,
  onRename,
  onClose,
  footer,
}: {
  anchorRect: DOMRect;
  // Open, or animating closed (hooks/use-presence.ts).
  isOpen?: boolean;
  // In the table's order.
  columns: EditorColumn[];
  visibility: Record<string, boolean>;
  frozenCount: number;
  onToggle: (key: string) => void;
  onToggleAll: (checked: boolean) => void;
  onReorder: (keys: string[]) => void;
  // Owners and Admins (phase96); absent, names can't be changed here.
  onRename?: (key: string, label: string) => void;
  onClose: () => void;
  // Below the list: adding a column, for Owners and Admins (phase96).
  footer?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const visibleCount = frozenCount + columns.filter((c) => visibility[c.key] !== false).length;
  const totalCount = frozenCount + columns.length;
  const allShown = visibleCount === totalCount;
  const hidden = new Set(columns.filter((c) => visibility[c.key] === false).map((c) => c.key));

  useViewportFit(ref, anchorRect, { side: "below", align: "end" });

  return (
    <div className={`colpop wide on motion${isOpen ? " is-open" : ""}`} ref={ref}>
      <div className="cp-h">
        <b>Display Columns</b>
      </div>
      <div className="cp-b">
        <button type="button" className="cpr all" onClick={() => onToggleAll(!allShown)}>
          <span className={`cbx${allShown ? " on" : ""}`}>
            <svg viewBox="0 0 24 24">
              <path d="M20 6L9 17l-5-5" />
            </svg>
          </span>
          <span className="cn">All Columns</span>
          <span className="cs">
            {visibleCount} of {totalCount} shown
          </span>
        </button>
        <ColumnEditor columns={columns} hidden={hidden} onToggle={onToggle} onReorder={onReorder} onRename={onRename} />
      </div>
      {footer && <div className="cp-f">{footer}</div>}
    </div>
  );
}
