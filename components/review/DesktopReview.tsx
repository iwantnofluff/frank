"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviewController } from "@/hooks/use-review-controller";
import { ReviewViewSwitch, SharedFeedGrid } from "./SharedFeedGrid";
import { formatsLabel, postFormats } from "@/lib/formats";
import { ReviewMedia } from "./ReviewMedia";
import { MomentBadge } from "./MomentBadge";
import { GuestComposer } from "./GuestComposer";
import { PhoneFrame } from "@/components/creative-review/PhoneFrame";

// Kept free beside the phone: the post's title above it and the scroll
// note below.
const RESERVE = 110;

export function DesktopReview({
  controller,
  agencyName,
  logoUrl,
  shown,
}: {
  controller: ReviewController;
  agencyName: string;
  logoUrl: string | null;
  shown: boolean; // the layout on screen (phone or desktop)
}) {
  const { creatives, active, activeIndex, goTo } = controller;
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
            <div className="m-logo" style={logoUrl ? { overflow: "hidden", padding: 0 } : undefined}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
              <img src={logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              "F"
            )}
          </div>
            <div>
              <b>{agencyName}</b>
              <span>{creatives.length} shared</span>
            </div>
          </div>
          <ReviewViewSwitch controller={controller} />
          <div className="dk-items">
            {creatives.map((c, i) => (
              <button
                key={c.id}
                className="dk-item"
                aria-current={i === activeIndex}
                onClick={() => goTo(i)}
              >
                <div className="t">
                  <b>{c.name}</b>
                  <span className="fmt">{formatsLabel(postFormats(c))}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="dk-main">
          {controller.view === "feed" ? (
            <SharedFeedGrid controller={controller} />
          ) : !active ? (
            <div className="m-empty">
              <b>Nothing to review</b>
              <p>There&rsquo;s nothing in scope for this link right now.</p>
            </div>
          ) : (
            <div className="dk-card">
              <div className="cmeta">
                <div className="ct">{active.name}</div>
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
                        <i />
                      </div>
                      <div>
                        <b>{agencyName}</b>
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
                        <b>{agencyName}</b>
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
                  <time>{new Date(c.created_at).toLocaleDateString()}</time>
                </div>
                <MomentBadge comment={c} controller={controller} />
                <p>{c.body}</p>
              </div>
            ))}
          </div>
          {active && <GuestComposer controller={controller} variant="desktop" />}
        </div>
      </div>
    </div>
  );
}
