"use client";

import type { ReviewController } from "@/hooks/use-review-controller";
import { GuestComposer } from "./GuestComposer";

export function MobileReview({
  controller,
  agencyName,
}: {
  controller: ReviewController;
  agencyName: string;
}) {
  const { creatives, active, activeIndex, goTo } = controller;
  // Already signed server-side (see /api/shared-review) — a public visitor
  // has no session to sign a Storage URL with themselves.
  const signedUrl = active?.asset?.signed_url ?? null;

  return (
    <div className="phone">
      <div className="ph-notch" />
      <div className="ph-screen">
        <div className="m-top">
          <div className="m-logo">F</div>
          <div className="m-t">
            <b>{agencyName}</b>
            <span>Shared for review</span>
          </div>
          <span className="m-count">
            {creatives.length ? activeIndex + 1 : 0} / {creatives.length}
          </span>
        </div>

        {creatives.length > 1 && (
          <div className="m-nav">
            <button
              className="m-arrow"
              disabled={activeIndex === 0}
              onClick={() => goTo(activeIndex - 1)}
            >
              <svg viewBox="0 0 24 24">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <div className="m-pager">
              {creatives.map((c, i) => (
                <button
                  key={c.id}
                  className={i === activeIndex ? "on" : ""}
                  onClick={() => goTo(i)}
                />
              ))}
            </div>
            <button
              className="m-arrow"
              disabled={activeIndex === creatives.length - 1}
              onClick={() => goTo(activeIndex + 1)}
            >
              <svg viewBox="0 0 24 24">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        )}

        <div className="m-scroll">
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
                    <span>{active.format}</span>
                    {active.destination && <span>· {active.destination}</span>}
                  </div>
                </div>
                <div className="m-art">
                  {signedUrl ? (
                    active.asset?.mime_type.startsWith("video/") ? (
                      <video src={signedUrl} controls style={{ width: "100%" }} />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={signedUrl} alt={active.name} style={{ width: "100%" }} />
                    )
                  ) : (
                    <div className="ig-noasset" style={{ color: "var(--muted)" }}>
                      No preview available
                    </div>
                  )}
                </div>
                {active.copy?.fields?.caption && (
                  <div className="m-cap">{active.copy.fields.caption}</div>
                )}
              </div>
            )}

            {active?.comments.map((c) => (
              <div className="m-cmt" key={c.id}>
                <div className="ch">
                  <span className="av" style={{ background: "var(--action)" }}>
                    {c.author_name.slice(0, 1).toUpperCase()}
                  </span>
                  <b>{c.author_name}</b>
                  <span>{new Date(c.created_at).toLocaleDateString()}</span>
                </div>
                <p>{c.body}</p>
              </div>
            ))}
          </div>
        </div>

        {active && <GuestComposer controller={controller} variant="mobile" />}
      </div>
    </div>
  );
}
