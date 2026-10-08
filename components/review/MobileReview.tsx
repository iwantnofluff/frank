"use client";

import type { ReviewController } from "@/hooks/use-review-controller";
import { ReviewViewSwitch, SharedFeedGrid } from "./SharedFeedGrid";
import { ReviewBrandHeader } from "./ReviewBrandHeader";
import { formatsLabel, postFormats } from "@/lib/formats";
import { ReviewMedia } from "./ReviewMedia";
import { MomentBadge } from "./MomentBadge";
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
  const clientLogoUrl = controller.data?.status === "ok" ? controller.data.client_logo_url : null;

  return (
    <div className="phone">
      <div className="ph-screen">
        <div className="m-top">
          <ReviewBrandHeader
            agencyName={agencyName}
            agencyLogoUrl={logoUrl}
            clientName={clientName}
            detail={projectName}
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
          <div className="m-body">
            {!active ? (
              <div className="m-empty">
                <b>Nothing to review</b>
                <p>There&rsquo;s nothing in scope for this link right now.</p>
              </div>
            ) : (
              <div className="m-card">
                <div className="m-meta">
                  <b>{active.name}</b>
                  <div className="mm">
                    <span>{formatsLabel(postFormats(active))}</span>
                    {active.destination && <span>· {active.destination}</span>}
                  </div>
                </div>
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
                  <svg viewBox="0 0 24 24">
                    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.8-.9L3 20.5l1.5-4.4A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z" />
                  </svg>
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
                  <span>{new Date(c.created_at).toLocaleDateString()}</span>
                </div>
                <MomentBadge comment={c} controller={controller} />
                <p>{c.body}</p>
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
