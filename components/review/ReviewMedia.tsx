"use client";

import { useEffect, useState } from "react";
import type { SharedCreative } from "@/hooks/use-shared-review";
import type { ReviewController } from "@/hooks/use-review-controller";
import { VideoPlayer, type TimelineMarker } from "@/components/creative-review/VideoPlayer";
import { commentTime } from "@/lib/annotations";
import { NoArtwork } from "@/components/creative-review/NoArtwork";
import { CarouselNav } from "@/components/creative-review/CarouselNav";
import { slideFrames } from "@/lib/slide-frames";

// The image area of a post on the review link (phone and desktop): the
// artwork, a carousel's slides with arrows, or "No artwork yet".
export function ReviewMedia({
  active,
  controller,
  shown,
}: {
  active: SharedCreative;
  controller: ReviewController;
  // Whether this layout is the one on screen — only it reports the paused
  // moment and slide (both layouts are drawn).
  shown: boolean;
}) {
  const slides = active.slides?.length
    ? active.slides
    : active.asset
      ? [{ position: 1, signed_url: active.asset.signed_url, mime_type: active.asset.mime_type, filename: active.asset.filename }]
      : [];
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<"next" | "prev" | null>(null);
  // Each post starts at its first slide.
  const [indexFor, setIndexFor] = useState(active.id);
  if (indexFor !== active.id) {
    setIndexFor(active.id);
    setIndex(0);
    setDir(null);
  }
  // A comment picked on another of a carousel's video slides goes to it.
  const seek = controller.videoSeek;
  const [seekFor, setSeekFor] = useState<number | null>(null);
  if (seek && seek.nonce !== seekFor) {
    setSeekFor(seek.nonce);
    if (seek.slide && seek.slide - 1 !== index) setIndex(seek.slide - 1);
  }

  // One place per slide, so an empty slide still counts (lib/slide-frames).
  const frames = slideFrames(slides, active.slide_count);
  const at = Math.min(index, Math.max(frames.length - 1, 0));
  const slide = frames[at];
  // Every reload of the review (after a comment, say) signs the files
  // afresh; a video given a new link would start again from 0:00, so each
  // file keeps the first link it was given for the visit.
  const [firstUrls, setFirstUrls] = useState<Record<string, string>>({});
  const urlKey = slide ? `${active.id}:${slide.position}` : null;
  if (urlKey && slide?.signed_url && !firstUrls[urlKey]) {
    setFirstUrls((m) => ({ ...m, [urlKey]: slide.signed_url! }));
  }
  const stableSrc = (urlKey && firstUrls[urlKey]) || slide?.signed_url || null;
  // Already signed server-side; load every image up front so the next
  // slide is ready when its arrow is pressed.
  const joined = slides.filter((s) => s.signed_url && s.mime_type.startsWith("image/")).map((s) => s.signed_url).join("\n");
  useEffect(() => {
    for (const u of joined.split("\n")) if (u) new Image().src = u;
  }, [joined]);

  if (!frames.length) {
    return <NoArtwork format={active.format} note="The agency hasn't uploaded the artwork for this post yet." />;
  }
  return (
    <>
      {!slide ? (
        <NoArtwork format={active.format} note={`Slide ${at + 1} has no artwork yet.`} />
      ) : !slide.signed_url ? (
        <div className="ig-noasset">No preview available</div>
      ) : slide.mime_type.startsWith("video/") ? (
        // A timeline with a marker per comment made at a moment; pausing
        // sets the moment a new comment is attached to (phase34).
        <VideoPlayer
          key={`${active.id}:${slide.position}`}
          src={stableSrc!}
          // Only this slide's comments, when it's one video of several.
          markers={active.comments.flatMap((c) => {
            const t = commentTime(c.anchor);
            if (t === null || ((c.anchor as { slide?: number } | null)?.slide ?? 1) !== slide.position) return [];
            return [{ commentId: c.id, t, kind: c.anchor?.type === "time" ? "time" : "pin" } as TimelineMarker];
          })}
          highlightedCommentId={controller.highlightedCommentId}
          onMarker={controller.setHighlightedCommentId}
          seek={controller.videoSeek}
          onMoment={
            shown
              ? (t) => {
                  controller.setVideoMoment(t);
                  controller.setVideoSlide(frames.length > 1 ? slide.position : null);
                }
              : undefined
          }
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
        <img
          key={slide.position}
          className={dir ? `car-in-${dir}` : undefined}
          src={slide.signed_url}
          alt={active.name}
          style={{ width: "100%" }}
        />
      )}
      <CarouselNav
        index={at}
        count={frames.length}
        onChange={(i) => {
          setDir(i > at ? "next" : "prev");
          setIndex(i);
          controller.setVideoMoment(null);
        }}
        overVideo={!!slide?.mime_type.startsWith("video/")}
      />
    </>
  );
}
