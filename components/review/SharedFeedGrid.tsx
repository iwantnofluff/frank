"use client";

import type { ReviewController } from "@/hooks/use-review-controller";
import { LoadMore } from "@/components/creative-review/LoadMore";

// A review link's Feed view (phase54): the client's real Instagram profile,
// the posts shared in this link first, then their real posts, so they see
// how their grid will read once these go live. Picking a shared post opens
// it; a real post opens on Instagram. Only shown once the client's
// Instagram is connected.
export function SharedFeedGrid({ controller }: { controller: ReviewController }) {
  const { liveFeed, creatives, goTo, setView } = controller;
  if (!liveFeed) return null;
  return (
    <div className="feedcard sharedfeed">
      <div className="fp-h">
        <span className="fp-av">
          {liveFeed.profile.pictureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Instagram's own short-lived image URL
            <img src={liveFeed.profile.pictureUrl} alt="" />
          ) : (
            <i />
          )}
        </span>
        <span className="fp-t">
          <b>{liveFeed.profile.username}</b>
          <span className="fp-counts">
            {liveFeed.profile.posts != null && `${liveFeed.profile.posts.toLocaleString()} posts`}
            {liveFeed.profile.followers != null && ` · ${liveFeed.profile.followers.toLocaleString()} followers`}
          </span>
        </span>
      </div>
      <div className="feedgrid">
        {creatives.map((c, i) => {
          const image = c.asset?.mime_type.startsWith("image/") ? c.asset.signed_url : null;
          return (
            <button
              key={c.id}
              type="button"
              className="feedgrid-tile sharedfeed-planned"
              title={c.name}
              onClick={() => {
                goTo(i);
                setView("post");
              }}
            >
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
                <img src={image} alt={c.name} />
              ) : (
                <span className="sharedfeed-name">{c.name}</span>
              )}
              <span className="sharedfeed-badge">For review</span>
            </button>
          );
        })}
        {liveFeed.posts.map((p) => (
          <a
            key={p.id}
            className="feedgrid-tile feedgrid-live"
            href={p.permalink}
            target="_blank"
            rel="noreferrer"
            title={p.caption ?? "Live on Instagram"}
          >
            {p.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- Instagram's own short-lived image URL
              <img src={p.imageUrl} alt={p.caption ?? ""} loading="lazy" />
            )}
          </a>
        ))}
        <LoadMore {...controller.liveMore} />
      </div>
    </div>
  );
}

// Post or Feed, once there's a feed to show.
export function ReviewViewSwitch({ controller }: { controller: ReviewController }) {
  if (!controller.liveFeed) return null;
  return (
    <div className="seg2 reviewviews" role="group" aria-label="View">
      <button type="button" aria-pressed={controller.view === "post"} onClick={() => controller.setView("post")}>
        Post
      </button>
      <button type="button" aria-pressed={controller.view === "feed"} onClick={() => controller.setView("feed")}>
        Feed
      </button>
    </div>
  );
}
