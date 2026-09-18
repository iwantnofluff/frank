"use client";

import type { ReviewController } from "@/hooks/use-review-controller";
import { GuestComposer } from "./GuestComposer";

export function DesktopReview({
  controller,
  agencyName,
  linkUrl,
}: {
  controller: ReviewController;
  agencyName: string;
  linkUrl: string;
}) {
  const { creatives, active, activeIndex, goTo } = controller;
  // Already signed server-side (see /api/shared-review) — a public visitor
  // has no session to sign a Storage URL with themselves.
  const signedUrl = active?.asset?.signed_url ?? null;

  return (
    <div className="browser">
      <div className="br-bar">
        <div className="br-dots">
          <i />
          <i />
          <i />
        </div>
        <div className="br-url">{linkUrl}</div>
      </div>
      <div className="br-screen">
        <div className="dk-list">
          <div className="dk-lh">
            <div className="m-logo">F</div>
            <div>
              <b>{agencyName}</b>
              <span>{creatives.length} shared</span>
            </div>
          </div>
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
                  <span className="fmt">{c.format}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="dk-main">
          {!active ? (
            <div className="m-empty">
              <b>Nothing to review</b>
              <p>There&rsquo;s nothing in scope for this link right now.</p>
            </div>
          ) : (
            <div className="dk-card">
              <div className="cmeta">
                <div className="ct">{active.name}</div>
                <div className="cs">
                  <span>{active.format}</span>
                  {active.destination && (
                    <>
                      <span className="sep">·</span>
                      <span>{active.destination}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="ig">
                <div className="ig-media">
                  {signedUrl ? (
                    active.asset?.mime_type.startsWith("video/") ? (
                      <video src={signedUrl} controls />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={signedUrl} alt={active.name} />
                    )
                  ) : (
                    <div className="ig-noasset">No preview available</div>
                  )}
                </div>
                {active.copy?.fields?.caption && (
                  <div className="ig-cap">
                    <span>{active.copy.fields.caption}</span>
                  </div>
                )}
              </div>
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
              <div className="cmt" key={c.id}>
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
