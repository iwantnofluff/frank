"use client";

import type { ReviewController } from "@/hooks/use-review-controller";
import { useState } from "react";
import { LoadMore } from "@/components/creative-review/LoadMore";
import { FeedProfile, FeedTabs, LiveTile, type FeedTab } from "@/components/creative-review/FeedChrome";
import { LivePostView } from "@/components/creative-review/LivePostView";
import { useSharedInstagramSlides } from "@/hooks/use-shared-review";
import type { LiveFeed } from "@/lib/instagram/store";
import { postFormats } from "@/lib/formats";

// A review link's Feed view (phase54): the client's real Instagram profile,
// the posts shared in this link first, then their real posts, so they see
// how their grid will read once these go live. Picking a shared post opens
// it; a real post opens on Instagram. Only shown once the client's
// Instagram is connected.
export function SharedFeedGrid({ controller }: { controller: ReviewController }) {
  const { liveFeed, creatives, goTo, setView } = controller;
  const [tab, setTab] = useState<FeedTab>("posts");
  // A live post opened in the post view, over the grid.
  const [openPost, setOpenPost] = useState<LiveFeed["posts"][number] | null>(null);
  const slides = useSharedInstagramSlides(controller.token, controller.passcode, openPost?.carousel ? openPost.id : null);
  if (!liveFeed) return null;
  // Posts, or just the Reels (a Reel-format post shared here, or a real Reel).
  const shared = creatives
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => tab === "posts" || postFormats(c).includes("ig_reel"));
  const live = tab === "reels" ? liveFeed.posts.filter((p) => p.reel) : liveFeed.posts;
  return (
    <div className="feedcard sharedfeed">
      {openPost && (
        <LivePostView
          post={openPost}
          profile={liveFeed.profile}
          slides={slides.data}
          slidesLoading={slides.isPending && !!openPost.carousel}
          onBack={() => setOpenPost(null)}
        />
      )}
      <FeedProfile
        profile={liveFeed.profile}
        fallbackName={liveFeed.profile.username}
        logoUrl={controller.data?.status === "ok" ? controller.data.client_logo_url : null}
      />
      <FeedTabs tab={tab} onTab={setTab} />
      <div className={tab === "reels" ? "feedgrid reels" : "feedgrid"}>
        {shared.map(({ c, i }) => {
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
        {live.map((p) => (
          <LiveTile key={p.id} post={p} onOpen={() => setOpenPost(p)} />
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
