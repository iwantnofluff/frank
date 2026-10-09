"use client";

import type { ReviewController } from "@/hooks/use-review-controller";
import { ReviewViewSwitch, SharedFeedGrid } from "./SharedFeedGrid";
import { ReviewBrandHeader } from "./ReviewBrandHeader";
import { useReviewViewer } from "@/hooks/use-review-viewer";
import { CommentWhen } from "@/components/creative-review/CommentWhen";
import { CommentJump, useSwipe } from "./mobile-gestures";
import { formatsLabel, postFormats } from "@/lib/formats";
import { ReviewMedia } from "./ReviewMedia";
import { MomentBadge } from "./MomentBadge";
import { SharedCommentText } from "./SharedCommentText";
import { GuestComposer } from "./GuestComposer";

export function MobileReview({
  controller,
  clientName,
  projectName,
  agencyName,
  logoUrl,
  shown,
}: {
  controller: ReviewController;
  clientName: string;
  projectName: string;
  agencyName: string;
  logoUrl: string | null;
  shown: boolean; // the layout on screen (phone or desktop)
}) {
  const { creatives, active, activeIndex, goTo } = controller;
  // Signed in, and on the workspace's team: the post's name links into Frank.
  const { data: viewer } = useReviewViewer();
  const clientLogoUrl = controller.data?.status === "ok" ? controller.data.client_logo_url : null;
  // Swiping sideways moves between posts (direct instruction), as on
  // Instagram; not when it starts on a carousel's slides or a video, where a
  // thumb is after the arrows or the timeline.
  const swipe = useSwipe(
    (dir) => goTo(activeIndex + dir),
    (target) => {
      if (!(target as Element).closest?.(".ig-media")) return true;
      const slides = active?.slides?.length ?? 0;
      return slides <= 1 && !active?.asset?.mime_type.startsWith("video/");
    },
  );

  return (
    <div className="phone">
      <div className="ph-screen">
        <div className="m-top">
          <ReviewBrandHeader
            agencyName={agencyName}
            agencyLogoUrl={logoUrl}
            clientName={clientName}
            clientId={controller.data?.status === "ok" ? controller.data.client_id : null}
            projectName={projectName}
            projectId={controller.data?.status === "ok" ? controller.data.project.id : null}
            aside={
              // Which post of how many, with the arrows beside it (direct
              // instruction: in place of the bar under the switch).
              <div className="m-step">
                {creatives.length > 1 && (
                  <button
                    type="button"
                    className="m-arrow"
                    aria-label="Previous post"
                    disabled={activeIndex === 0}
                    onClick={() => goTo(activeIndex - 1)}
                  >
                    <svg viewBox="0 0 24 24">
                      <path d="M15 18l-6-6 6-6" />
                    </svg>
                  </button>
                )}
                <span className="m-count">
                  {creatives.length ? activeIndex + 1 : 0} / {creatives.length}
                </span>
                {creatives.length > 1 && (
                  <button
                    type="button"
                    className="m-arrow"
                    aria-label="Next post"
                    disabled={activeIndex === creatives.length - 1}
                    onClick={() => goTo(activeIndex + 1)}
                  >
                    <svg viewBox="0 0 24 24">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                )}
              </div>
            }
          />
        </div>

        <ReviewViewSwitch controller={controller} />

        <div className="m-scroll">
          {controller.view === "feed" ? (
            <SharedFeedGrid controller={controller} brandName={clientName} />
          ) : (
          <div className="m-body" onTouchStart={swipe.start} onTouchEnd={swipe.end}>
            {!active ? (
              <div className="m-empty">
                <b>Nothing to review</b>
                <p>There&rsquo;s nothing in scope for this link right now.</p>
              </div>
            ) : (
              <>
              {/* The post's name and format above it, so the card itself
                  starts with the logo and handle, as an Instagram post does. */}
              <div className="m-meta">
                {/* For the workspace's team, the post's own page in Frank. */}
                <b>
                  {viewer?.isTeam ? (
                    <a className="rv-link" href={`/creatives/${active.id}`}>
                      {active.name}
                    </a>
                  ) : (
                    active.name
                  )}
                </b>
                <div className="mm">
                  <span>{formatsLabel(postFormats(active))}</span>
                  {active.destination && <span>· {active.destination}</span>}
                </div>
              </div>
              <div className="m-card">
                <div className="ig-h">
                  <div className="ig-av">
                    {/* The client's logo beside the handle (direct instruction). */}
                    {clientLogoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
                      <img src={clientLogoUrl} alt="" />
                    ) : (
                      <i />
                    )}
                  </div>
                  <div>
                    <b>{clientName}</b>
                  </div>
                  <div className="dots">•••</div>
                </div>
                <div className="ig-media">
                  <ReviewMedia active={active} controller={controller} shown={shown} />
                </div>
                <div className="ig-acts">
                  <svg viewBox="0 0 24 24">
                    <path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21.5l8.8-8.8a5 5 0 0 0 0-7.1z" />
                  </svg>
                  <CommentJump variant="mobile" />
                  <svg viewBox="0 0 24 24">
                    <path d="M22 2L11 13" />
                    <path d="M22 2l-7 20-4-9-9-4z" />
                  </svg>
                  <svg className="save" viewBox="0 0 24 24">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                {active.copy?.fields?.caption && (
                  <div className="ig-cap">
                    <b>{clientName}</b>
                    <span>{active.copy.fields.caption}</span>
                  </div>
                )}
              </div>
              </>
            )}

            {active?.comments.map((c) => (
              <div
                className={`m-cmt${controller.highlightedCommentId === c.id ? " act" : ""}${c.id.startsWith("pending-") ? " pending" : ""}`}
                key={c.id}
              >
                <div className="ch">
                  <span className="av" style={{ background: "var(--action)" }}>
                    {c.author_name.slice(0, 1).toUpperCase()}
                  </span>
                  <b>{c.author_name}</b>
                  <CommentWhen iso={c.created_at} date={new Date(c.created_at).toLocaleDateString()} />
                </div>
                <MomentBadge comment={c} controller={controller} />
                <SharedCommentText comment={c} controller={controller} />
              </div>
            ))}
          </div>
          )}
        </div>

        {active && controller.view === "post" && <GuestComposer controller={controller} variant="mobile" />}
      </div>
    </div>
  );
}
