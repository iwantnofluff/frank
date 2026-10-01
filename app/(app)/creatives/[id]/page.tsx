"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useCreative } from "@/hooks/use-creative";
import { useAdvanceCreativeStage } from "@/hooks/use-advance-creative-stage";
import { useCreativeVersions, versionSlides } from "@/hooks/use-creative-versions";
import { useCopyVersions } from "@/hooks/use-copy-versions";
import { useAssetSignedUrl, usePreloadAssets } from "@/hooks/use-asset-signed-url";
import { useComments } from "@/hooks/use-comments";
import { useCreateComment } from "@/hooks/use-create-comment";
import { useMyMembership } from "@/hooks/use-my-membership";
import { useTeamMembers } from "@/hooks/use-team-members";
import { formatsLabel, postFormats } from "@/lib/formats";
import { slideFrames } from "@/lib/slide-frames";
import {
  commentTime,
  isHighlightAnchor,
  isPinAnchor,
  isRegionAnchor,
  type HighlightAnchor,
  type PinAnchor,
  type RegionAnchor,
} from "@/lib/annotations";
import { BriefPanel } from "@/components/creative-review/BriefPanel";
import { ChecksPanel } from "@/components/creative-review/ChecksPanel";
import { ReviewNav, type ReviewSection } from "@/components/creative-review/ReviewNav";
import { FeedPreviewGrid } from "@/components/creative-review/FeedPreviewGrid";
import { CommentsPanel } from "@/components/creative-review/CommentsPanel";
import { ShareModal } from "@/components/creative-review/ShareModal";
import { AnnotationLayer, type ToolMode } from "@/components/creative-review/AnnotationLayer";
import { NoArtwork } from "@/components/creative-review/NoArtwork";
import { CarouselNav } from "@/components/creative-review/CarouselNav";
import { VideoPlayer, type TimelineMarker } from "@/components/creative-review/VideoPlayer";
import { CaptionHighlighter } from "@/components/creative-review/CaptionHighlighter";
import { CreativeModal } from "@/components/creative-review/CreativeModal";

// How close, in seconds, the paused moment has to be to a pin's for it to
// show on the frame — about a frame or two either side.
const VIDEO_FRAME_TOLERANCE = 0.25;

export default function CreativeReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const {
    data: creative,
    isLoading: creativeLoading,
    isError: creativeError,
  } = useCreative(id);
  const { data: creativeVersions } = useCreativeVersions(id);
  const { data: copyVersions } = useCopyVersions(id);
  const { data: membership, isLoading: membershipLoading } = useMyMembership(
    creative?.agency_id,
  );
  const { data: teamMembers } = useTeamMembers(creative?.agency_id);
  const isStaff = membership ? membership.client_id === null : false;
  const advanceStage = useAdvanceCreativeStage(id);
  const leadName =
    teamMembers?.find((m) => m.user_id === creative?.lead_user_id)?.user?.name ?? null;
  // Independent selections: picking a copy version never touches which
  // artwork version is showing, and vice versa (frank-schema.docx —
  // "Versions are independent").
  const [creativeVersionId, setCreativeVersionId] = useState<string | null>(
    null,
  );
  const [copyVersionId, setCopyVersionId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  // null = closed. CreativeModal replaced the separate Upload or Edit /
  // Draft from Brief entry points with one window — this just remembers
  // which tab it should open on for whichever button was clicked.
  const [creativeModalTab, setCreativeModalTab] = useState<"brief" | "upload" | null>(null);
  const [toolMode, setToolMode] = useState<ToolMode>(null);
  // Which of Brief/Content/Checks/Feed Preview the canvas shows — replaced
  // the three independent accordions (Brief/Content/Checks could each be
  // open at once) with a single selection, per direct instruction.
  const [activeSection, setActiveSection] = useState<ReviewSection>("content");
  const [navCollapsed, setNavCollapsed] = useState(false);
  // Feed Preview → Content linking: the same creative just switches section
  // (no navigation needed), a different one is a real route change — this
  // page is scoped to one creative's id, so there's no other way to show it.
  function selectFeedCreative(clickedId: string) {
    if (clickedId === id) {
      setActiveSection("content");
    } else {
      router.push(`/creatives/${clickedId}`);
    }
  }
  const [highlightedCommentId, setHighlightedCommentId] = useState<
    string | null
  >(null);

  // Shared with CommentsPanel via the same query cache (identical key), so
  // clicking a marker here and clicking a comment there both read and write
  // the same "which thread is highlighted" state.
  const { data: allComments } = useComments(id);
  const createComment = useCreateComment(id);

  const activeCreativeVersion =
    creativeVersions?.find((v) => v.id === creativeVersionId) ??
    creativeVersions?.[0] ??
    null;
  const activeCopyVersion =
    copyVersions?.find((v) => v.id === copyVersionId) ??
    copyVersions?.[0] ??
    null;

  // A carousel's slides (a single upload is one slide). The arrows move
  // between them, one place per slide even if one is still empty; a new
  // version starts again at the first.
  const slides = versionSlides(activeCreativeVersion);
  const frames = slideFrames(slides, creative?.slide_count);
  const [slideIndex, setSlideIndex] = useState(0);
  // Which way the last arrow went, so the next slide slides in from that side.
  const [slideDir, setSlideDir] = useState<"next" | "prev" | null>(null);
  function goToSlide(i: number) {
    setSlideDir(i > frameIndex ? "next" : "prev");
    setSlideIndex(i);
  }
  const [slideFor, setSlideFor] = useState(activeCreativeVersion?.id);
  if (slideFor !== activeCreativeVersion?.id) {
    setSlideFor(activeCreativeVersion?.id);
    setSlideIndex(0);
    setSlideDir(null);
  }
  const frameIndex = Math.min(slideIndex, Math.max(frames.length - 1, 0));
  const currentSlide = frames[frameIndex] ?? null;
  const slidePosition = frameIndex + 1;

  const { data: signedUrl } = useAssetSignedUrl(currentSlide?.asset.storage_key);
  usePreloadAssets(slides.filter((s) => s.asset.mime_type.startsWith("image/")).map((s) => s.asset.storage_key));

  // A video (phase34): the paused moment new comments are attached to, and
  // a request to jump to a comment's moment.
  const [videoMoment, setVideoMoment] = useState<number | null>(null);
  const [videoSeek, setVideoSeek] = useState<{ t: number; nonce: number } | null>(null);

  // Picking a comment pinned to another slide moves to that slide; one made
  // at a moment in a video goes to that moment.
  function highlightComment(commentId: string | null) {
    setHighlightedCommentId(commentId);
    const anchor = (allComments ?? []).find((c) => c.id === commentId)?.anchor;
    const at = commentTime(anchor);
    if (at !== null) setVideoSeek({ t: at, nonce: Date.now() });
    if (anchor && (isPinAnchor(anchor) || isRegionAnchor(anchor))) {
      const i = (anchor.slide ?? 1) - 1;
      if (i < frames.length) setSlideIndex(i);
    }
  }

  const { pins, regions, nextAnnotationNumber, captionHighlights } = (() => {
    // Only the pins and boxes on the slide being shown.
    const onVersion = (allComments ?? []).filter(
      (c) => activeCreativeVersion && c.creative_version_id === activeCreativeVersion.id,
    );
    const forVersion = onVersion.filter(
      (c) => ((c.anchor as { slide?: number } | null)?.slide ?? 1) === slidePosition,
    );
    const pins = forVersion
      .filter((c) => isPinAnchor(c.anchor))
      .map((c) => ({ ...(c.anchor as PinAnchor), commentId: c.id }));
    const regions = forVersion
      .filter((c) => isRegionAnchor(c.anchor))
      .map((c) => ({ ...(c.anchor as RegionAnchor), commentId: c.id }));
    // Numbered across every slide, so slide 2's first pin follows slide 1's.
    const nextAnnotationNumber =
      onVersion.filter((c) => isPinAnchor(c.anchor) || isRegionAnchor(c.anchor)).length + 1;

    const captionHighlights = (allComments ?? [])
      .filter(
        (c) =>
          activeCopyVersion &&
          c.copy_version_id === activeCopyVersion.id &&
          isHighlightAnchor(c.anchor) &&
          c.anchor.field === "caption",
      )
      .map((c) => ({ ...(c.anchor as HighlightAnchor), commentId: c.id }));

    return { pins, regions, nextAnnotationNumber, captionHighlights };
  })();

  if (creativeLoading) {
    return (
      <div className="pad">
        <p className="sub">Loading…</p>
      </div>
    );
  }

  if (creativeError || !creative) {
    return (
      <div className="pad">
        <div className="empty">
          <b>Couldn&rsquo;t load this creative</b>
          <span>It may have been archived, or you may not have access.</span>
        </div>
      </div>
    );
  }

  const clientName = creative.projects?.clients?.name ?? "This client";
  const caption = activeCopyVersion?.fields?.caption;
  const isVideo = currentSlide?.asset.mime_type.startsWith("video/");
  // Every comment on this version made at a moment, as timeline markers.
  const videoMarkers: TimelineMarker[] = (allComments ?? [])
    .filter((c) => !c.parent_id && activeCreativeVersion && c.creative_version_id === activeCreativeVersion.id)
    .flatMap((c) => {
      const t = commentTime(c.anchor);
      if (t === null) return [];
      const kind = isPinAnchor(c.anchor) ? "pin" : isRegionAnchor(c.anchor) ? "region" : "time";
      return [{ commentId: c.id, t, kind } as TimelineMarker];
    });

  return (
    <div className={`review${navCollapsed ? " navcollapsed" : ""}`}>
      <ReviewNav
        active={activeSection}
        onSelect={setActiveSection}
        collapsed={navCollapsed}
        onToggleCollapsed={() => setNavCollapsed((c) => !c)}
      />
      <div className="review-sep" aria-hidden="true" />

      <div className="stage">
        <div className="stage-h">
          <div className="tools">
            <div className="vsel">
              <label htmlFor="vCreative">Creative</label>
              <select
                id="vCreative"
                value={activeCreativeVersion?.id ?? ""}
                onChange={(e) => setCreativeVersionId(e.target.value)}
                disabled={!creativeVersions?.length}
              >
                {creativeVersions?.length ? (
                  creativeVersions.map((v) => (
                    <option key={v.id} value={v.id}>
                      V{v.version_no}
                    </option>
                  ))
                ) : (
                  <option value="">—</option>
                )}
              </select>
            </div>
            <div className="vsel">
              <label htmlFor="vCopy">Copy</label>
              <select
                id="vCopy"
                value={activeCopyVersion?.id ?? ""}
                onChange={(e) => setCopyVersionId(e.target.value)}
                disabled={!copyVersions?.length}
              >
                {copyVersions?.length ? (
                  copyVersions.map((v) => (
                    <option key={v.id} value={v.id}>
                      V{v.version_no}
                    </option>
                  ))
                ) : (
                  <option value="">—</option>
                )}
              </select>
            </div>
            {isStaff && (
              <>
                <span className="toolsep" />
                <div
                  className="stagesw"
                  title="Whether this post is visible through a share link, and whether it's been approved"
                >
                  <button
                    type="button"
                    aria-pressed={creative.stage < 3}
                    disabled={advanceStage.isPending}
                    onClick={() => {
                      if (creative.stage >= 3) advanceStage.mutate("to_internal");
                    }}
                  >
                    Internal Review
                  </button>
                  <button
                    type="button"
                    aria-pressed={creative.stage === 3}
                    disabled={advanceStage.isPending}
                    onClick={() => {
                      if (creative.stage !== 3) advanceStage.mutate("to_review");
                    }}
                  >
                    Client Review
                  </button>
                  <button
                    type="button"
                    aria-pressed={creative.stage === 4}
                    disabled={advanceStage.isPending}
                    onClick={() => {
                      if (creative.stage !== 4) advanceStage.mutate("to_approved");
                    }}
                  >
                    Approved
                  </button>
                </div>
              </>
            )}
            <button
              type="button"
              className="tool"
              title={creative.stage === 3 ? "Share for review" : "Only available in Client Review"}
              disabled={creative.stage !== 3}
              onClick={() => setShareOpen(true)}
            >
              <svg viewBox="0 0 24 24">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
              </svg>
            </button>
            {isStaff && (
              <>
                <span className="toolsep" />
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => setCreativeModalTab("upload")}
                >
                  Edit
                </button>
              </>
            )}
          </div>
        </div>
        <div className="canvas">
          <div>
            {activeSection === "brief" && (
              <BriefPanel
                creative={creative}
                latestCopyVersion={copyVersions?.[0] ?? null}
                leadName={leadName}
              />
            )}
            {/* With copy but no artwork it still shows as a post, the
                artwork's place saying so — it can be read and commented on
                the same. Only a post with neither gets the empty state. */}
            {activeSection === "content" &&
              (slides.length === 0 && !activeCopyVersion ? (
              <div className="awaiting">
                <svg viewBox="0 0 24 24">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M3 15l5-5 4 4 3-3 6 6" />
                  <circle cx="9" cy="9" r="1.4" />
                </svg>
                <b>No artwork yet</b>
                <span>
                  {membershipLoading
                    ? " "
                    : isStaff
                      ? "The brief is written. Add the artwork once it has been made."
                      : "The agency hasn't uploaded anything for this piece yet."}
                </span>
                {isStaff && (
                  <button
                    type="button"
                    className="btn primary sm"
                    style={{ marginTop: 10 }}
                    onClick={() => setCreativeModalTab("upload")}
                  >
                    Upload Artwork
                  </button>
                )}
              </div>
            ) : (
                <div className="postbox">
              <div className="cmeta">
                <div className="ct">{creative.name}</div>
                <div className="cs">
                  <span>{formatsLabel(postFormats(creative))}</span>
                </div>
              </div>
              <div className="ig">
                <div className="ig-h">
                  <div className="ig-av">
                    <i />
                  </div>
                  <div>
                    <b>{clientName}</b>
                  </div>
                  <div className="dots">•••</div>
                </div>
                <div className="ig-media">
                  {/* No version yet, one saved with every slide removed, or a
                      carousel slide that has no image yet. */}
                  {!currentSlide ? (
                    <NoArtwork
                      format={creative.format}
                      note={
                        membershipLoading
                          ? undefined
                          : frames.length > 1
                            ? `Slide ${slidePosition} has no image yet.`
                            : isStaff
                              ? "The copy is in. Add the artwork once it has been made."
                              : "The agency hasn't uploaded the artwork for this post yet."
                      }
                    >
                      {isStaff && (
                        <button
                          type="button"
                          className="btn primary sm"
                          style={{ marginTop: 10 }}
                          onClick={() => setCreativeModalTab("upload")}
                        >
                          Upload Artwork
                        </button>
                      )}
                    </NoArtwork>
                  ) : !signedUrl ? (
                    <div className="ig-noasset">
                      {currentSlide?.asset.filename ?? "No preview available"}
                    </div>
                  ) : isVideo ? (
                    <VideoPlayer
                      src={signedUrl}
                      markers={videoMarkers}
                      highlightedCommentId={highlightedCommentId}
                      onMarker={setHighlightedCommentId}
                      seek={videoSeek}
                      pauseNow={toolMode !== null}
                      onMoment={setVideoMoment}
                      // Paused, a comment's pin or box shows on the frame it
                      // was made on; while playing, none do.
                      overlay={(t, paused) => (
                        <AnnotationLayer
                          mode={paused ? toolMode : null}
                          pins={paused ? pins.filter((p) => Math.abs((p.t ?? 0) - t) < VIDEO_FRAME_TOLERANCE) : []}
                          regions={paused ? regions.filter((r) => Math.abs((r.t ?? 0) - t) < VIDEO_FRAME_TOLERANCE) : []}
                          nextNumber={nextAnnotationNumber}
                          highlightedCommentId={highlightedCommentId}
                          showVisibilityToggle={isStaff}
                          onSelect={setHighlightedCommentId}
                          onCreate={(anchor, body, visibility) => {
                            createComment.mutate({
                              body,
                              parentId: null,
                              visibility,
                              creativeVersionId: activeCreativeVersion!.id,
                              anchor: { ...anchor, t: Math.round(t * 100) / 100 },
                            });
                            setToolMode(null);
                          }}
                        />
                      )}
                    />
                  ) : (
                    <>
                      {/* Signed URLs are short-lived and per-request — not a
                          fit for next/image's static optimisation. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        key={slidePosition}
                        className={slideDir ? `car-in-${slideDir}` : undefined}
                        src={signedUrl}
                        alt={creative.name}
                      />
                      <AnnotationLayer
                        mode={toolMode}
                        pins={pins}
                        regions={regions}
                        nextNumber={nextAnnotationNumber}
                        highlightedCommentId={highlightedCommentId}
                        showVisibilityToggle={isStaff}
                        onSelect={setHighlightedCommentId}
                        onCreate={(anchor, body, visibility) => {
                          createComment.mutate({
                            body,
                            parentId: null,
                            visibility,
                            // A slide is showing, so its version exists.
                            creativeVersionId: activeCreativeVersion!.id,
                            anchor: frames.length > 1 ? { ...anchor, slide: slidePosition } : anchor,
                          });
                          setToolMode(null);
                        }}
                      />
                    </>
                  )}
                  <CarouselNav index={frameIndex} count={frames.length} onChange={goToSlide} />
                </div>
                <div className="ig-acts">
                  <svg viewBox="0 0 24 24">
                    <path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21.5l8.8-8.8a5 5 0 0 0 0-7.1z" />
                  </svg>
                  <svg viewBox="0 0 24 24">
                    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.8-.9L3 20.5l1.5-4.4A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z" />
                  </svg>
                  <svg viewBox="0 0 24 24">
                    <path d="M22 2L11 13" />
                    <path d="M22 2l-7 20-4-9-9-4z" />
                  </svg>
                </div>
                <div className="ig-cap">
                  <b>{clientName}</b>
                  {caption ? (
                    <CaptionHighlighter
                      text={caption}
                      field="caption"
                      highlights={captionHighlights}
                      highlightedCommentId={highlightedCommentId}
                      showVisibilityToggle={isStaff}
                      onSelect={setHighlightedCommentId}
                      onCreate={(anchor, body, visibility) => {
                        createComment.mutate({
                          body,
                          parentId: null,
                          visibility,
                          copyVersionId: activeCopyVersion?.id ?? null,
                          anchor,
                        });
                      }}
                    />
                  ) : (
                    <span>
                      {copyVersions?.length
                        ? "No caption on this copy version."
                        : "No copy uploaded yet."}
                    </span>
                  )}
                </div>
                <div className="ig-time">
                  {slides.length > 0 && activeCreativeVersion
                    ? `Uploaded ${new Date(activeCreativeVersion.created_at).toLocaleDateString()}`
                    : activeCopyVersion
                      ? `Copy saved ${new Date(activeCopyVersion.created_at).toLocaleDateString()}`
                      : null}
                </div>
              </div>
            </div>
              ))}
            {activeSection === "checks" && (
              <ChecksPanel
                creative={creative}
                latestCopyVersion={copyVersions?.[0] ?? null}
              />
            )}
            {activeSection === "feed" && (
              <FeedPreviewGrid
                projectId={creative.project_id}
                activeCreativeId={creative.id}
                brandName={clientName}
                onSelect={selectFeedCreative}
              />
            )}
          </div>
        </div>
      </div>
      <div className="review-sep" aria-hidden="true" />

      <CommentsPanel
        creativeId={id}
        highlightedCommentId={highlightedCommentId}
        onHighlight={highlightComment}
        toolMode={toolMode}
        onToolModeChange={setToolMode}
        canAnnotate={!!currentSlide}
        videoMoment={isVideo ? videoMoment : null}
        creativeVersionId={activeCreativeVersion?.id ?? null}
      />

      {shareOpen && (
        <ShareModal
          projectId={creative.project_id}
          currentCreativeId={creative.id}
          brandName={clientName}
          onClose={() => setShareOpen(false)}
        />
      )}

      {creativeModalTab && (
        <CreativeModal
          mode="edit"
          creative={creative}
          creativeVersions={creativeVersions ?? []}
          copyVersions={copyVersions ?? []}
          initialTab={creativeModalTab}
          onClose={() => setCreativeModalTab(null)}
          onCreativeVersionCreated={setCreativeVersionId}
          onCopyVersionCreated={setCopyVersionId}
        />
      )}
    </div>
  );
}
