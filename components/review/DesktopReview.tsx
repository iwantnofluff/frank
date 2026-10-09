"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviewController } from "@/hooks/use-review-controller";
import { SharedFeedGrid } from "./SharedFeedGrid";
import { CommentCount } from "./CommentCount";
import { CommentWhen } from "@/components/creative-review/CommentWhen";
import { ReviewBrandHeader } from "./ReviewBrandHeader";
import { useReviewViewer } from "@/hooks/use-review-viewer";
import { CommentJump } from "./mobile-gestures";
import { REVIEW_GROUPS, reviewGroup } from "./review-group";
import { ReviewNav, type ReviewSection } from "@/components/creative-review/ReviewNav";
import { formatsLabel, postFormats } from "@/lib/formats";
import { ReviewMedia } from "./ReviewMedia";
import { MomentBadge } from "./MomentBadge";
import { SharedCommentText } from "./SharedCommentText";
import { GuestComposer } from "./GuestComposer";
import { PhoneFrame } from "@/components/creative-review/PhoneFrame";

// Kept free beside the phone: the post's title above it and the scroll
// note below.
const RESERVE = 110;

const SECTIONS: { id: ReviewSection; label: string }[] = [
  { id: "content", label: "Content" },
  { id: "feed", label: "Feed" },
];

export function DesktopReview({
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
  // The Review page's section menu, with only Content and Feed (direct
  // instruction); Content is the post, Feed the grid.
  const [navCollapsed, setNavCollapsed] = useState(false);
  const clientLogoUrl = controller.data?.status === "ok" ? controller.data.client_logo_url : null;
  // Whether the post goes on below the phone's screen, for the note under it.
  const scroller = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  const measure = useCallback(() => {
    const el = scroller.current;
    setMore(!!el && el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  }, []);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTop = 0;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [active?.id, controller.view, measure]);

  return (
    <div className="browser">
      <div className="br-screen">
        <div className="dk-list">
          <div className="dk-lh">
            <ReviewBrandHeader
              agencyName={agencyName}
              agencyLogoUrl={logoUrl}
              clientName={clientName}
              clientId={controller.data?.status === "ok" ? controller.data.client_id : null}
              projectName={projectName}
              projectId={controller.data?.status === "ok" ? controller.data.project.id : null}
              count={`${creatives.length} ${creatives.length === 1 ? "post" : "posts"}`}
            />
          </div>
          <div className="dk-items">
            {/* Grouped (direct instruction): still to review first, then
                what the client has commented on, then what's approved. */}
            {REVIEW_GROUPS.map((g) => {
              const items = creatives.map((c, i) => ({ c, i })).filter(({ c }) => reviewGroup(c) === g.id);
              if (!items.length) return null;
              return (
                <div key={g.id} className="dk-group">
                  <div className="dk-group-h">
                    {g.label} <span>{items.length}</span>
                    {/* When Approved artwork goes (direct instruction), from
                        the client's Preferences. */}
                    {g.id === "approved" && (
                      <em>
                        · Artwork removed {controller.data?.status === "ok" ? controller.data.artwork_keep_days : 7} days after
                        going live
                      </em>
                    )}
                  </div>
                  {items.map(({ c, i }) => (
                    <button
                      key={c.id}
                      className="dk-item"
                      aria-current={i === activeIndex}
                      onClick={() => {
                        goTo(i);
                        controller.setView("post");
                      }}
                    >
                      <div className="t">
                        <b>{c.name}</b>
                        <span className="fmt">{formatsLabel(postFormats(c))}</span>
                      </div>
                      <CommentCount n={c.comments.length} />
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <div className="dk-nav">
          <ReviewNav
            sections={SECTIONS}
            active={controller.view === "feed" ? "feed" : "content"}
            onSelect={(section) => controller.setView(section === "feed" ? "feed" : "post")}
            collapsed={navCollapsed}
            onToggleCollapsed={() => setNavCollapsed((c) => !c)}
          />
        </div>

        <div className="dk-main">
          {controller.view === "feed" ? (
            <div className="dk-card">
              {/* Headed like the post, so the phone stays where it was. */}
              <div className="cmeta">
                <div className="ct">Feed</div>
                <div className="cs">
                  <span>Posts in this link open when clicked</span>
                </div>
              </div>
              <PhoneFrame reserve={RESERVE}>
                <SharedFeedGrid controller={controller} brandName={clientName} />
              </PhoneFrame>
            </div>
          ) : !active ? (
            <div className="m-empty">
              <b>Nothing to review</b>
              <p>There&rsquo;s nothing in scope for this link right now.</p>
            </div>
          ) : (
            <div className="dk-card">
              <div className="cmeta">
                {/* For the workspace's team (direct instruction), the post's
                    name opens its own Review page in Frank. */}
                <div className="ct">
                  {viewer?.isTeam ? (
                    <a className="rv-link" href={`/creatives/${active.id}`}>
                      {active.name}
                    </a>
                  ) : (
                    active.name
                  )}
                </div>
                <div className="cs">
                  <span>{formatsLabel(postFormats(active))}</span>
                  {active.destination && (
                    <>
                      <span className="sep">·</span>
                      <span>{active.destination}</span>
                    </>
                  )}
                </div>
              </div>
              {/* In the same phone as the Review page (direct instruction:
                  desktop only; the phone layout is the phone itself). It
                  fits the window, and the post scrolls inside it. */}
              <PhoneFrame reserve={RESERVE}>
                <div className="lpv-bar">
                  <b>Posts</b>
                </div>
                <div className="pf-scroll" ref={scroller} onScroll={measure}>
                  <div className="ig">
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
                      <CommentJump variant="desktop" />
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
                </div>
              </PhoneFrame>
              {more && (
                <p className="dk-scrollhint">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 5v14M6 13l6 6 6-6" />
                  </svg>
                  Scroll inside the phone to read the caption
                </p>
              )}
            </div>
          )}
        </div>

        <div className="dk-side">
          <div className="dk-sh">
            <b>Comments</b>
            <span className="n">{active?.comments.length ?? 0}</span>
          </div>
          <div className="dk-cmts">
            {active?.comments.length === 0 && (
              <p className="sub">No comments yet.</p>
            )}
            {active?.comments.map((c) => (
              <div className={`cmt${controller.highlightedCommentId === c.id ? " act" : ""}${c.id.startsWith("pending-") ? " pending" : ""}`} key={c.id}>
                <div className="cmt-h">
                  <span
                    className="who"
                    style={{ background: "var(--action)" }}
                  >
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
          {active && <GuestComposer controller={controller} variant="desktop" />}
        </div>
      </div>
    </div>
  );
}
