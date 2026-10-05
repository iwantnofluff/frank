"use client";

import { useRef, useState } from "react";
import type { LiveFeed, LiveSlide } from "@/lib/instagram/store";

type LivePost = LiveFeed["posts"][number];

const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

// One of the client's live posts, opened from the feed grid (phase54), read
// like Instagram's own post view: the account, the post, then its caption
// and date. A video or Reel plays here (muted to start, as Instagram does);
// a carousel moves between its slides with arrows, dots, or a swipe. Back
// returns to the grid; the original is a link away.
export function LivePostView({
  post,
  profile,
  slides,
  slidesLoading,
  onBack,
}: {
  post: LivePost;
  profile: LiveFeed["profile"];
  // A carousel's slides, once fetched; undefined for any other post.
  slides: LiveSlide[] | undefined;
  slidesLoading: boolean;
  onBack: () => void;
}) {
  const frames: LiveSlide[] = post.carousel
    ? (slides ?? [])
    : [{ id: post.id, imageUrl: post.imageUrl, videoUrl: post.videoUrl }];
  const [index, setIndex] = useState(0);
  const at = Math.min(index, Math.max(frames.length - 1, 0));
  const frame = frames[at];
  const swipeFrom = useRef<number | null>(null);

  function go(next: number) {
    setIndex(Math.max(0, Math.min(frames.length - 1, next)));
  }

  return (
    <div className="lpv">
      <div className="lpv-bar">
        <button type="button" className="lpv-back" aria-label="Back to the grid" onClick={onBack}>
          <svg viewBox="0 0 24 24">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <b>Posts</b>
      </div>
      <div className="lpv-scroll">
        <div className="lpv-h">
          <span className="fp-av">
            {profile.pictureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Instagram's own short-lived image URL
              <img src={profile.pictureUrl} alt="" />
            ) : (
              <i />
            )}
          </span>
          <b>{profile.username}</b>
        </div>

        <div
          className="lpv-media"
          onPointerDown={(e) => (swipeFrom.current = e.clientX)}
          onPointerUp={(e) => {
            if (swipeFrom.current === null) return;
            const dx = e.clientX - swipeFrom.current;
            swipeFrom.current = null;
            if (Math.abs(dx) > 40) go(at + (dx < 0 ? 1 : -1));
          }}
        >
          {post.carousel && slidesLoading ? (
            <div className="lpv-wait">Loading slides…</div>
          ) : !frame ? (
            <div className="lpv-wait">This post couldn&rsquo;t be loaded.</div>
          ) : frame.videoUrl ? (
            // Muted to start, as on Instagram; the controls turn sound on.
            <video key={frame.id} src={frame.videoUrl} poster={frame.imageUrl ?? undefined} controls autoPlay muted loop playsInline />
          ) : frame.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Instagram's own short-lived image URL
            <img key={frame.id} src={frame.imageUrl} alt={post.caption ?? ""} draggable={false} />
          ) : null}
          {frames.length > 1 && at > 0 && (
            <button type="button" className="lpv-arrow prev" aria-label="Previous slide" onClick={() => go(at - 1)}>
              <svg viewBox="0 0 24 24">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          )}
          {frames.length > 1 && at < frames.length - 1 && (
            <button type="button" className="lpv-arrow next" aria-label="Next slide" onClick={() => go(at + 1)}>
              <svg viewBox="0 0 24 24">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          )}
          {frames.length > 1 && <span className="lpv-count">{`${at + 1}/${frames.length}`}</span>}
        </div>
        {frames.length > 1 && (
          <div className="lpv-dots" aria-label={`Slide ${at + 1} of ${frames.length}`}>
            {frames.map((f, i) => (
              <span key={f.id} className={i === at ? "on" : undefined} />
            ))}
          </div>
        )}

        <div className="lpv-cap">
          {post.caption && (
            <p>
              <b>{profile.username}</b> {post.caption}
            </p>
          )}
          <span className="lpv-date">{when(post.at)}</span>
          <a href={post.permalink} target="_blank" rel="noreferrer">
            Open on Instagram
          </a>
        </div>
      </div>
    </div>
  );
}
