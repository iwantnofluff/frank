"use client";

import { useRef } from "react";
import { useCopyVersions } from "@/hooks/use-copy-versions";
import { useViewportFit } from "@/hooks/use-viewport-fit";
import { useComments } from "@/hooks/use-comments";
import { stageColor, stageLabel, exceptionLabel } from "@/lib/stage-labels";
import { aspectRatioCss, formatsLabel, postFormats } from "@/lib/formats";
import { useCreativeVersions, versionSlides } from "@/hooks/use-creative-versions";
import { useAssetSignedUrl } from "@/hooks/use-asset-signed-url";
import { NoArtwork } from "@/components/creative-review/NoArtwork";
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

// Ports frank-prototype.html's #evpop/showPreview — hovering a creative
// (in the calendar table or the calendar grid) shows this, in a phone, with
// its real artwork (or "no artwork yet"). Only real data:
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
  const { data: versions, isPending: versionsPending } = useCreativeVersions(creative.id);
  const art = versionSlides(versions?.[0])[0]?.asset ?? null;
  const { data: artUrl } = useAssetSignedUrl(art?.storage_key);
  const { data: comments } = useComments(creative.id);

  const latestCopy = copyVersions?.[0];
  const caption = latestCopy?.fields?.caption;
  const openComments = comments?.filter((c) => !c.resolved_at).length ?? 0;
  const color = stageColor(creative.stage, creative.exception);

  // Positioned from its real measured size, re-measured as the caption and
  // comments load in — a fixed 340px guess ran it off the bottom of the
  // screen once the real card turned out taller.
  const ref = useRef<HTMLDivElement>(null);
  useViewportFit(ref, anchorRect, { side: "beside" });

  return (
    // In the phone (direct instruction): a small version of the Feed
    // Preview's frame, the stage strip at the top of its screen.
    <div ref={ref} className="evpop on phonepop" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <span className="phonepop-notch" aria-hidden="true" />
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
      {/* Everything under the stage strip scrolls inside the phone, which
          keeps a fixed height (direct instruction). */}
      <div className="phonepop-scroll">
      <div className="pp-h">
        <span className="pp-av">
          <i />
        </span>
        <div>
          <b>{creative.name}</b>
          <span>{formatsLabel(postFormats(creative))}</span>
        </div>
      </div>
      <div className="pp-media">
        {/* The post's latest artwork (its first slide), or the review
            page's own "no artwork yet" while there isn't any (direct
            instruction). */}
        {art?.mime_type.startsWith("video/") && artUrl ? (
          <video src={artUrl} muted playsInline preload="metadata" />
        ) : art && artUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
          <img src={artUrl} alt={creative.name} />
        ) : art || versionsPending ? (
          <div className="pp-loading" style={{ aspectRatio: aspectRatioCss(creative.format) }} />
        ) : (
          <NoArtwork format={creative.format} />
        )}
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
      {caption && (
        <div className="pp-cap">
          <b>V{latestCopy!.version_no}</b>
          {caption}
        </div>
      )}
      </div>
    </div>
  );
}
