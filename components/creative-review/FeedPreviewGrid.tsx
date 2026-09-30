"use client";

import { useMemo, useRef, useState } from "react";
import { useCreatives, type CreativeListRow } from "@/hooks/use-creatives";
import { FeedTileArt, EmptyTileArt } from "@/components/creative-review/FeedTileArt";
import { FeedCaptionPopover } from "@/components/creative-review/FeedCaptionPopover";

const GRID_SLOTS = 9;

// The 2nd reference mockup (a plain Instagram grid, header+tabs above it) —
// every other creative in this project, per direct instruction (not the
// whole client: this page is scoped to one project's work, and pooling
// every project would mix in posts nothing here is reviewing). Real
// artwork per tile where one's been uploaded (FeedTileArt), a plain
// "No Creative"/"Live Post" label otherwise — see FeedTileArt.tsx for
// which is which and why.
//
// The header/tabs chrome (.fp-h/.fp-tabs) is the prototype's own
// #feedPanel markup (frank-prototype.html) — that feature (a live
// Instagram-connected grid) was deferred (docs/parity-gaps.md), but its
// static header/tab-row chrome is exactly what this mockup asks for, so
// it's ported now rather than redrawn from scratch. Only "Posts" has
// anything behind it here — Reels/Saved/Tagged are the prototype's own
// tabs with no Frank feature backing them, so they're plain, non-clickable
// chrome (not real buttons) rather than dead buttons that do nothing.
export function FeedPreviewGrid({
  projectId,
  activeCreativeId,
  brandName,
  onSelect,
}: {
  projectId: string;
  activeCreativeId: string;
  brandName: string;
  onSelect: (creativeId: string) => void;
}) {
  const { data: allCreatives, isLoading } = useCreatives(projectId);
  // Deleted (archived_at) posts never show here — useCreatives now
  // returns them too, for the project page's own Active/Archived toggle.
  const creatives = useMemo(() => (allCreatives ?? []).filter((c) => !c.archived_at), [allCreatives]);

  // Same hover-preview pattern as ProjectCalendarTable's own creative
  // rows: a short delay before showing (so a pointer passing over several
  // tiles doesn't pop one open per tile) and before hiding (so the pointer
  // has time to cross from the tile onto the popover itself), which the
  // popover's own onMouseEnter/onMouseLeave then cancels/extends.
  const [hover, setHover] = useState<{ creative: CreativeListRow; rect: DOMRect } | null>(
    null,
  );
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleEnter(creative: CreativeListRow, target: HTMLElement) {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    const rect = target.getBoundingClientRect();
    hoverTimeout.current = setTimeout(() => setHover({ creative, rect }), 200);
  }
  function scheduleHide() {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setHover(null), 200);
  }
  function cancelHide() {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
  }

  return (
    <>
    <div className="feedcard">
      <div className="fp-h">
        <span className="fp-av">
          <i />
        </span>
        <span className="fp-t">
          <b>{brandName}</b>
        </span>
      </div>
      <div className="fp-tabs" role="tablist" aria-label="Profile sections">
        <div className="fp-tab" aria-selected="true" title="Posts">
          <svg viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="1.5" />
            <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
          </svg>
        </div>
        <div className="fp-tab" aria-selected="false" title="Reels">
          <svg viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="4" />
            <path d="M3 8h18M8.5 3l3 5M15 3l3 5" />
            <path d="M11 12.5l4 2.2-4 2.2z" fill="currentColor" stroke="none" />
          </svg>
        </div>
        <div className="fp-tab" aria-selected="false" title="Saved">
          <svg viewBox="0 0 24 24">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <div className="fp-tab" aria-selected="false" title="Tagged">
          <svg viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <circle cx="12" cy="10" r="3" />
            <path d="M6.5 19a5.8 5.8 0 0 1 11 0" />
          </svg>
        </div>
      </div>

      {isLoading ? (
        <div className="awaiting">
          <span>Loading feed…</span>
        </div>
      ) : (
        <div className="feedgrid">
          {creatives.map((c) => {
            const timeLabel = c.scheduled_at
              ? new Date(c.scheduled_at).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })
              : "—";
            return (
              <button
                key={c.id}
                type="button"
                className={`feedgrid-tile${c.published_at ? "" : " not-live"}`}
                aria-current={c.id === activeCreativeId}
                onClick={() => onSelect(c.id)}
                onMouseEnter={(e) => handleEnter(c, e.currentTarget)}
                onMouseLeave={scheduleHide}
                title={c.name}
              >
                <FeedTileArt creative={c} timeLabel={timeLabel} />
              </button>
            );
          })}
          {/* Pad up to a fixed 9 slots — real empty tiles, not just blank
              space, per direct instruction. Never rendered when there are
              already 9+ real creatives; overflow scrolls instead. */}
          {Array.from({
            length: Math.max(0, GRID_SLOTS - creatives.length),
          }).map((_, i) => (
            <div key={`empty-${i}`} className="feedgrid-tile-empty">
              <EmptyTileArt />
            </div>
          ))}
        </div>
      )}
    </div>
    {hover && (
      <FeedCaptionPopover
        creative={hover.creative}
        anchorRect={hover.rect}
        onMouseEnter={cancelHide}
        onMouseLeave={scheduleHide}
      />
    )}
    </>
  );
}
