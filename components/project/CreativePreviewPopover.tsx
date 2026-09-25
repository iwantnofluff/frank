"use client";

import type { CSSProperties } from "react";
import { useCopyVersions } from "@/hooks/use-copy-versions";
import { useComments } from "@/hooks/use-comments";
import { stageColor, stageLabel, exceptionLabel } from "@/lib/stage-labels";
import { formatById } from "@/lib/formats";
import type { CreativeListRow } from "@/hooks/use-creatives";

function relativeTime(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

function hashString(s: string) {
  let n = 0;
  for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0;
  return n;
}

// A decorative gradient standing in for the real artwork — this popover
// never fetches creative_versions, so there's no real image to show. Ports
// the spirit of the prototype's own art() (a generated placeholder, not a
// real render) rather than its literal SVG, and drops the fabricated
// like/view counts postHTML() shows alongside it — no schema backs those.
//
// The title/time overlay is plain HTML, not SVG <text> — an SVG text
// element doesn't inherit the page's font stack the way an ordinary DOM
// node does, so it rendered in a generic fallback font at the wrong size
// instead of the app's actual type (Inter, via the same CSS every other
// creative name uses). The gradient rect stays SVG since it has no text.
function PlaceholderArt({ creative, timeLabel }: { creative: CreativeListRow; timeLabel: string }) {
  const hue = hashString(creative.id) % 360;
  const gradientId = `pg-${creative.id}`;
  return (
    <div className="pp-art">
      <svg viewBox="0 0 306 230" width="306" height="230" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={`hsl(${hue}, 55%, 24%)`} />
            <stop offset="1" stopColor={`hsl(${hue}, 55%, 12%)`} />
          </linearGradient>
        </defs>
        <rect width="306" height="230" fill={`url(#${gradientId})`} />
      </svg>
      <div className="pp-art-overlay">
        <div className="pp-art-title">{creative.name}</div>
        <div className="pp-art-time">{timeLabel}</div>
      </div>
    </div>
  );
}

// Ports frank-prototype.html's #evpop/showPreview — hovering a creative
// (in the calendar table or the calendar grid) shows this. Only real data:
// name, stage/exception, real open-comment count, the real caption (latest
// copy_versions row, fetched here on demand rather than for every visible
// row), and a real "published X ago" once creatives.published_at is set.
// No fabricated likes/views — the prototype's own numbers there
// (`nfmt(400+hash(name)%2400)`) have no schema backing at all.
export function CreativePreviewPopover({
  creative,
  anchorRect,
  onMouseEnter,
  onMouseLeave,
}: {
  creative: CreativeListRow;
  anchorRect: DOMRect;
  // Lets the popover itself keep the preview open while the pointer is
  // over the card, and hand back to the caller's own hide-delay once it
  // leaves — see ProjectCalendarTable's cancelHide/scheduleHide.
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  const { data: copyVersions } = useCopyVersions(creative.id);
  const { data: comments } = useComments(creative.id);

  const caption = copyVersions?.[0]?.fields?.caption;
  const openComments = comments?.filter((c) => !c.resolved_at).length ?? 0;
  const color = stageColor(creative.stage, creative.exception);
  const format = formatById(creative.format);
  const timeLabel = creative.scheduled_at
    ? new Date(creative.scheduled_at).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "—";

  // Computed straight from anchorRect + the window's current size — no
  // measurement of this popover's own (not-yet-rendered) size is needed,
  // so this is plain render-time math, not a DOM-measuring effect.
  const style: CSSProperties = (() => {
    const pw = 306;
    const ph = 340;
    let left = anchorRect.right + 10;
    if (left + pw > window.innerWidth - 8) left = anchorRect.left - pw - 10;
    if (left < 8) left = 8;
    let top = anchorRect.top - 10;
    if (top + ph > window.innerHeight - 8) top = Math.max(8, window.innerHeight - ph - 8);
    return { left, top };
  })();

  return (
    <div className="evpop on" style={style} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <div className="rv">
        <span className="rvt">{creative.name}</span>
        <span className="tag" style={{ background: `${color}1A`, color }}>
          <span className="dot" style={{ background: color }} />
          {creative.exception ? exceptionLabel(creative.exception) : stageLabel(creative.stage, "scheduled")}
        </span>
        {openComments > 0 && (
          <span className="cchip">
            <svg viewBox="0 0 24 24">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {openComments}
          </span>
        )}
      </div>
      <div className="pp-h">
        <span className="pp-av">
          <i />
        </span>
        <div>
          <b>{creative.name}</b>
          <span>{format?.label ?? creative.format}</span>
        </div>
      </div>
      <div className="pp-media">
        <PlaceholderArt creative={creative} timeLabel={timeLabel} />
      </div>
      <div className="pp-acts">
        <svg viewBox="0 0 24 24">
          <path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21.5l8.8-8.8a5 5 0 0 0 0-7.1z" />
        </svg>
        <svg viewBox="0 0 24 24">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      {creative.published_at ? (
        <div className="pp-published">Published {relativeTime(creative.published_at)}</div>
      ) : (
        <div className="pp-pending">Not published yet</div>
      )}
      {caption && <div className="pp-cap">{caption}</div>}
    </div>
  );
}
