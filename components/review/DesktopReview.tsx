"use client";

import { CopyFieldsPreview } from "@/components/creative-review/CopyFieldsPreview";
import { useEffect, useRef, useState } from "react";
import type { ReviewController } from "@/hooks/use-review-controller";
import { SharedFeedGrid } from "./SharedFeedGrid";
import { CommentCount } from "./CommentCount";
import { CommentWhen } from "@/components/creative-review/CommentWhen";
import { ReviewBrandHeader } from "./ReviewBrandHeader";
import { CommentJump } from "./mobile-gestures";
import { reviewGroup } from "./review-group";
import { ReviewNav, type ReviewSection } from "@/components/creative-review/ReviewNav";
import { copySummaryParts, formatsLabel, postFormats, isStoryFormat } from "@/lib/formats";
import { ReviewMedia } from "./ReviewMedia";
import { MomentBadge } from "./MomentBadge";
import { SharedCommentText } from "./SharedCommentText";
import { GuestComposer } from "./GuestComposer";
import { PhoneFrame } from "@/components/creative-review/PhoneFrame";
import { ScrollHint } from "@/components/creative-review/ScrollHint";
import { StoryReplyBar } from "@/components/creative-review/StoryReplyBar";
import { publishDate } from "@/lib/publish-date";

// Kept free beside the phone: the scroll note below it. No title above it
// (direct instruction: the list names the post).
const RESERVE = 46;

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
  // The project's kind, for each post's date after its name.
  const projectDelivery = controller.data?.status === "ok" ? controller.data.project.delivery : null;
  // The Review page's section menu, with only Content and Feed (direct
  // instruction); Content is the post, Feed the grid.
  const [navCollapsed, setNavCollapsed] = useState(false);
  const clientLogoUrl = controller.data?.status === "ok" ? controller.data.client_logo_url : null;
  // Each post starts at the top of the phone's screen.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [active?.id, controller.view]);

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
            {/* One level of heading (direct instruction): what this link
                was sent for, then the project's other posts waiting for
                review (or, for a link to the whole project, what's waiting),
                then recent approvals (review-group.ts). */}
            {controller.sections.map((sec) => {
              const start = creatives.indexOf(sec.items[0]);
              return (
                <div key={sec.id} className="dk-sec">
                  <div className="dk-sec-h">
                    {sec.label} <span>{sec.items.length}</span>
                  </div>
                  {sec.id === "approved" && (
                    // When Approved artwork goes (direct instruction), from
                    // the client's Preferences.
                    <div className="dk-sec-note">
                      {controller.approvedDays !== null && `Last ${controller.approvedDays} days · `}Artwork removed{" "}
                      {controller.data?.status === "ok" ? controller.data.artwork_keep_days : 7} days after going live
                    </div>
                  )}
                  {sec.items.map((c, k) => {
                    const i = start + k;
                    const date = publishDate(projectDelivery, c.scheduled_at, c.due_on);
                    return (
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
                          {/* Its date above its name (direct instruction). */}
                          {date && <span className="dk-date">{date}</span>}
                          <b>{c.name}</b>
                          <span className="fmt">{formatsLabel(postFormats(c))}</span>
                        </div>
                        {reviewGroup(c) === "commented" && <span className="dk-tag">Commented</span>}
                        <CommentCount n={c.comments.length} />
                      </button>
                    );
                  })}
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
              {/* In the same phone as the Review page (direct instruction:
                  desktop only; the phone layout is the phone itself). It
                  fits the window, and the post scrolls inside it. */}
              <PhoneFrame reserve={RESERVE}>
                <div className="lpv-bar">
                  <b>Posts</b>
                </div>
                <div className="pf-scroll" ref={scroller}>
                  {/* A Story as Instagram shows one (direct instruction). */}
                  <div className={`ig${isStoryFormat(active.format) ? " story" : ""}`}>
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
                    {isStoryFormat(active.format) && <StoryReplyBar />}
                    {active.copy?.fields?.caption ? (
                      <div className="ig-cap">
                        <b>{clientName}</b>
                        <span>{active.copy.fields.caption}</span>
                      </div>
                    ) : active.copy?.fields && copySummaryParts(active.copy.fields, postFormats(active)).others.length ? (
                      // No caption: the post's other copy (a listing's Title, Bullet
                      // Points and Description), under the images.
                      <div className="ig-cap">
                        <CopyFieldsPreview fields={active.copy.fields} formatIds={postFormats(active)} />
                      </div>
                    ) : null}
                  </div>
                </div>
              </PhoneFrame>
              {active && <ScrollHint formats={postFormats(active)} />}
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
