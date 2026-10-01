"use client";

import type { ReviewController } from "@/hooks/use-review-controller";
import { formatsLabel, postFormats } from "@/lib/formats";
import { NoArtwork } from "@/components/creative-review/NoArtwork";
import { GuestComposer } from "./GuestComposer";

export function MobileReview({
  controller,
  agencyName,
  logoUrl,
}: {
  controller: ReviewController;
  agencyName: string;
  logoUrl: string | null;
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
          <div className="m-logo" style={logoUrl ? { overflow: "hidden", padding: 0 } : undefined}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
              <img src={logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              "F"
            )}
          </div>
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
                    <span>{formatsLabel(postFormats(active))}</span>
                    {active.destination && <span>· {active.destination}</span>}
                  </div>
                </div>
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
                  {signedUrl ? (
                    active.asset?.mime_type.startsWith("video/") ? (
                      <video src={signedUrl} controls style={{ width: "100%" }} />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={signedUrl} alt={active.name} style={{ width: "100%" }} />
                    )
                  ) : !active.asset ? (
                    <NoArtwork format={active.format} note="The agency hasn't uploaded the artwork for this post yet." />
                  ) : (
                    <div className="ig-noasset">No preview available</div>
                  )}
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
