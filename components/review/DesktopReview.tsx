"use client";

import { CopyFieldsPreview } from "@/components/creative-review/CopyFieldsPreview";
import { useEffect, useRef, useState } from "react";
import type { ReviewController } from "@/hooks/use-review-controller";
import { SharedFeedGrid } from "./SharedFeedGrid";
import { CommentCount } from "./CommentCount";
import { LinkCommentHead } from "./LinkCommentHead";
import { TeamComments, useTeamOnPost } from "./TeamComments";
import { ReviewBrandHeader } from "./ReviewBrandHeader";
import { CommentJump } from "./mobile-gestures";
import { reviewGroup } from "./review-group";
import { STAGE } from "@/lib/stage-labels";
import { ReviewNav, type ReviewSection } from "@/components/creative-review/ReviewNav";
import { copySummaryParts, formatsLabel, postFormats, postSize } from "@/lib/formats";
import { FormatSwitch } from "@/components/creative-review/FormatSwitch";
import { PlatformPost } from "@/components/creative-review/PlatformPost";
import { postTemplate, tabletOrientation } from "@/lib/post-templates";
import { ReviewMedia } from "./ReviewMedia";
import { MomentBadge } from "./MomentBadge";
import { SharedCommentText } from "./SharedCommentText";
import { GuestComposer } from "./GuestComposer";
import { PhoneFrame } from "@/components/creative-review/PhoneFrame";
import { ScrollHint } from "@/components/creative-review/ScrollHint";
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
  // Signed in and on the team, able to see this post: its own comments.
  const team = useTeamOnPost(active?.id);
  // Signed in, and on the workspace's team: the post's name links into Frank.
  // The project's kind, for each post's date after its name.
  const projectDelivery = controller.data?.status === "ok" ? controller.data.project.delivery : null;
  // The Review page's section menu, with only Content and Feed (direct
  // instruction); Content is the post, Feed the grid.
  const [navCollapsed, setNavCollapsed] = useState(false);
  // Other Content's formats sit in an iPad (decided directly).
  const tablet = postTemplate(controller.shownFormat).device === "tablet";
  // Which way the iPad's held: an email upright, a board as its artwork
  // is (tabletOrientation), the iPad a fixed size (decided directly).
  const orientation = (artRatio: number | null) => tabletOrientation(controller.shownFormat, active ? postSize(controller.shownFormat, active.sizes) : null, artRatio);
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
                    // The client's: when it goes live (phase140).
                    const date = publishDate(projectDelivery, c.scheduled_at, c.publish_on ?? c.due_on);
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
                        {c.stage === STAGE.review && reviewGroup(c) === "commented" && <span className="dk-tag">Commented</span>}
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
            <div className={`dk-card${tablet ? " wide" : ""}`}>
              {/* Several formats: which the post is shown as (FormatSwitch). */}
              {postFormats(active).length > 1 && (
                <FormatSwitch className="dk-fmt" formats={postFormats(active)} shown={controller.shownFormat} onShow={controller.setShownFormat} />
              )}
              {/* In the same phone as the Review page (direct instruction:
                  desktop only; the phone layout is the phone itself). It
                  fits the window, and the post scrolls inside it. */}
              <PhoneFrame device={tablet ? "tablet" : "phone"} orientation={orientation} reserve={RESERVE + (postFormats(active).length > 1 ? 30 : 0)}>
                {/* The phone's "Posts" bar; not on an iPad. */}
                {!tablet && (
                  <div className="lpv-bar">
                    <b>Posts</b>
                  </div>
                )}
                <div className="pf-scroll" ref={scroller}>
                  {/* As its platform shows it (PlatformPost), with the
                      client's logo beside the handle (direct instruction). */}
                  <PlatformPost
                    format={controller.shownFormat}
                    frame="phone"
                    accountName={clientName}
                    avatarUrl={clientLogoUrl}
                    media={<ReviewMedia active={active} controller={controller} shown={shown} />}
                    fields={active.copy?.fields}
                    commentButton={<CommentJump variant="desktop" />}
                    fallback={
                      // No main text: the post's other copy (a listing's
                      // Title, Bullet Points and Description), under the images.
                      active.copy?.fields && copySummaryParts(active.copy.fields, postFormats(active)).others.length ? (
                        <CopyFieldsPreview fields={active.copy.fields} formatIds={postFormats(active)} />
                      ) : undefined
                    }
                  />
                </div>
              </PhoneFrame>
              {active && <ScrollHint formats={postFormats(active)} />}
            </div>
          )}
        </div>

        <div className="dk-side">
          {/* The team, signed in: the post's own comments (phase150). */}
          {active && team ? (
            <TeamComments creativeId={active.id} />
          ) : (
            <>
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
                      <LinkCommentHead comment={c} avatarClass="who" clientName={clientName} agencyName={agencyName} />
                    </div>
                    <MomentBadge comment={c} controller={controller} />
                    <SharedCommentText comment={c} controller={controller} />
                  </div>
                ))}
              </div>
              {active && <GuestComposer controller={controller} variant="desktop" />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
