"use client";

import { useThumbnailVersions } from "@/hooks/use-thumbnails";
import { useRef, useState, type CSSProperties } from "react";
import { useCopyVersions } from "@/hooks/use-copy-versions";
import { useViewportFit } from "@/hooks/use-viewport-fit";
import { useComments } from "@/hooks/use-comments";
import { stageColor, stageLabel, exceptionLabel } from "@/lib/stage-labels";
import { aspectRatioCss, formatsLabel, isStoryFormat, postFormats, postSize } from "@/lib/formats";
import { useCreativeVersions, versionSlides } from "@/hooks/use-creative-versions";
import { useArtworkUrl } from "@/hooks/use-asset-signed-url";
import { NoArtwork } from "@/components/creative-review/NoArtwork";
import type { CreativeListRow } from "@/hooks/use-creatives";
import { usePathname } from "next/navigation";
import { useProject } from "@/hooks/use-project";
import { useClientLogoUrl } from "@/hooks/use-client-logo-url";
import { PlatformPost } from "@/components/creative-review/PlatformPost";
import { postTemplate, tabletOrientation } from "@/lib/post-templates";

// The iPad's screen in the preview, a fixed size as on the Review page:
// 540 × 375 on its side, 380 × 547 upright.
const POP_LONG = 540;
const POP_SHORT = 375;

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
  // Shown on a project's own page: its client's logo beside the handle.
  const projectId = usePathname().match(/^\/projects\/([^/]+)/)?.[1] ?? "";
  const { data: project } = useProject(projectId);
  const clientLogoUrl = useClientLogoUrl(project?.client_id);
  const { data: versions, isPending: versionsPending } = useCreativeVersions(creative.id);
  // A video's thumbnail shows instead of the video, when it has one
  // (phase118, decided directly).
  const { data: thumbnails } = useThumbnailVersions(creative.id);
  const thumb = thumbnails?.find((t) => t.asset)?.asset ?? null;
  const art = thumb ?? versionSlides(versions?.[0])[0]?.asset ?? null;
  const { data: artUrl } = useArtworkUrl(art?.storage_key);
  const { data: comments } = useComments(creative.id);

  const latestCopy = copyVersions?.[0];
  const openComments = comments?.filter((c) => !c.resolved_at).length ?? 0;
  const color = stageColor(creative.stage, creative.exception);
  // A Story fills the phone's screen, its account laid over it, as the
  // Review page draws one (direct instruction); everything else as there too.
  const story = isStoryFormat(creative.format);
  // Other Content's formats in an iPad, the rest in the phone, each in its
  // platform's look, as the Review page draws them (reported directly).
  const tablet = postTemplate(creative.format).device === "tablet";
  // Held as on the Review page (tabletOrientation): an email upright, a
  // board as its artwork is, by its chosen size else the image's own shape.
  const [natural, setNatural] = useState<number | null>(null);
  const portrait = tablet && tabletOrientation(creative.format, postSize(creative.format, creative.sizes), natural) === "portrait";
  const screen = portrait ? { w: 380, h: 547 } : { w: POP_LONG, h: POP_SHORT };

  // Positioned from its real measured size, re-measured as the caption and
  // comments load in — a fixed 340px guess ran it off the bottom of the
  // screen once the real card turned out taller.
  const ref = useRef<HTMLDivElement>(null);
  useViewportFit(ref, anchorRect, { side: "beside" });

  const header = (
    <div className="pp-h">
      <span className="pp-av">
        {clientLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
          <img src={clientLogoUrl} alt="" />
        ) : (
          <i />
        )}
      </span>
      <div>
        <b>{creative.name}</b>
        <span>{formatsLabel(postFormats(creative))}</span>
      </div>
    </div>
  );

  // The post's latest artwork (its first slide), or the review page's own
  // "no artwork yet" while there isn't any (direct instruction).
  const media = (
    <>
      {art?.mime_type.startsWith("video/") && artUrl ? (
        // Its format's shape from the start (direct instruction: a Reel's
        // phone drew small, then grew once the video had loaded).
        <video
          src={`${artUrl}#t=0.1`}
          muted
          playsInline
          preload="metadata"
          style={{ aspectRatio: aspectRatioCss(creative.format, creative.sizes), objectFit: "cover" }}
        />
      ) : art && artUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
        <img
          src={artUrl}
          alt={creative.name}
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth && img.naturalHeight) setNatural(img.naturalWidth / img.naturalHeight);
        }}
          // A thumbnail in the video's shape.
          style={thumb ? { aspectRatio: aspectRatioCss(creative.format, creative.sizes), objectFit: "cover" } : undefined}
        />
      ) : art || versionsPending ? (
        <div className="pp-loading" style={{ aspectRatio: aspectRatioCss(creative.format, creative.sizes) }} />
      ) : (
        <NoArtwork
          format={creative.format}
          sizes={creative.sizes}
          title={creative.artwork_removed_at ? "Artwork removed" : undefined}
        />
      )}
    </>
  );
  const published = creative.published_at ? (
    <div className="pp-published">Published {relativeTime(creative.published_at)}</div>
  ) : (
    <div className="pp-pending">Not published yet</div>
  );

  return (
    // In the phone (direct instruction): a small version of the Feed
    // Preview's frame, the stage strip at the top of its screen.
    <div
      ref={ref}
      className={`evpop on phonepop${story ? " story" : ""}${tablet ? " tabletpop" : ""}${portrait ? " portrait" : ""}`}
      // The iPad's width, from its screen's (and 10px of frame each side),
      // and the room a board's artwork is drawn whole in.
      style={
        tablet
          ? ({ width: screen.w + 20, "--screen-w": `${screen.w}px`, "--screen-h": `${screen.h}px`, "--art-r": natural ?? 1 } as CSSProperties)
          : undefined
      }
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span className="phonepop-notch" aria-hidden="true" />
      <div className="rv">
        {/* Just the stage, as the table's Status pill: the post's name is
            right below (direct instruction). */}
        <span className="stg" style={{ background: color }}>
          {creative.exception ? (
            exceptionLabel(creative.exception)
          ) : (
            <>
              <span className="no">{creative.stage}.</span>
              {stageLabel(creative.stage, "scheduled")}
            </>
          )}
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
      {/* On an iPad, the post's name stays put above its screen. */}
      {tablet && header}
      <div className="phonepop-scroll">
        {story ? (
          // A Story fills the screen, its account laid over it.
          <div className="pp-media">
            {header}
            {media}
          </div>
        ) : (
          <>
          {!tablet && header}
          <PlatformPost
            format={creative.format}
            frame="card"
            accountName={project?.clients?.name ?? "Client"}
            avatarUrl={clientLogoUrl ?? null}
            media={media}
            fields={latestCopy?.fields}
            footer={published}
          />
          </>
        )}
      </div>
    </div>
  );
}
