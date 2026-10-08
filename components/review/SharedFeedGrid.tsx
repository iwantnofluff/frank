"use client";

import type { ReviewController } from "@/hooks/use-review-controller";
import { useState } from "react";
import { LoadMore } from "@/components/creative-review/LoadMore";
import { FeedProfile, FeedTabs, LiveTile, type FeedTab } from "@/components/creative-review/FeedChrome";
import { EmptyTileArt } from "@/components/creative-review/FeedTileArt";
import { LivePostView } from "@/components/creative-review/LivePostView";
import { useSharedInstagramSlides } from "@/hooks/use-shared-review";
import type { LiveFeed } from "@/lib/instagram/store";
import { CommentCount } from "./CommentCount";

const GRID_SLOTS = 9;

// What a post this link doesn't share says on its tile (decided directly:
// its stage, nothing else).
const STAGE_TILE: Record<number, string> = {
  1: "In Progress",
  2: "Internal Review",
  3: "In Review",
  4: "Approved",
};

// A review link's Feed (phase54, then phase67): the client's profile, the
// project's posts in grid order, then the client's real posts once their
// Instagram is connected (placeholders until then, as on the Review page).
// The posts this link shares open on a click and show how many comments
// they have; every other post is a tile with its stage only.
export function SharedFeedGrid({ controller, brandName }: { controller: ReviewController; brandName: string }) {
  const { liveFeed, liveLoading, creatives, feed, active, goTo, setView } = controller;
  const [tab, setTab] = useState<FeedTab>("posts");
  // A live post opened in the post view, over the grid.
  const [openPost, setOpenPost] = useState<LiveFeed["posts"][number] | null>(null);
  const slides = useSharedInstagramSlides(controller.token, controller.passcode, openPost?.carousel ? openPost.id : null);
  const indexOf = new Map(creatives.map((c, i) => [c.id, i]));
  // Posts, or just the Reels (a Reel-format post, or a real Reel).
  const planned = feed.filter((e) => tab === "posts" || e.reel);
  const live = liveFeed ? (tab === "reels" ? liveFeed.posts.filter((p) => p.reel) : liveFeed.posts) : [];
  const empties = tab === "reels" || liveFeed ? 0 : Math.max(0, GRID_SLOTS - planned.length);
  return (
    <div className="feedcard sharedfeed">
      {openPost && liveFeed && (
        <LivePostView
          post={openPost}
          profile={liveFeed.profile}
          slides={slides.data}
          slidesLoading={slides.isPending && !!openPost.carousel}
          onBack={() => setOpenPost(null)}
        />
      )}
      <FeedProfile
        profile={liveFeed?.profile ?? null}
        fallbackName={liveFeed?.profile.username ?? brandName}
        logoUrl={controller.data?.status === "ok" ? controller.data.client_logo_url : null}
        loading={liveLoading}
      />
      <FeedTabs tab={tab} onTab={setTab} />
      <div className={tab === "reels" ? "feedgrid reels" : "feedgrid"}>
        {planned.map((e, n) => {
          const i = e.id ? indexOf.get(e.id) : undefined;
          const c = i === undefined ? null : creatives[i];
          if (!c || i === undefined) {
            return (
              <div key={`stage-${n}`} className="feedgrid-tile-empty sharedfeed-stage">
                <span>{STAGE_TILE[e.stage] ?? "In Progress"}</span>
              </div>
            );
          }
          const image = c.asset?.mime_type.startsWith("image/") ? c.asset.signed_url : null;
          return (
            <button
              key={c.id}
              type="button"
              className="feedgrid-tile sharedfeed-planned"
              title={c.name}
              aria-current={c.id === active?.id}
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
              <span className="sharedfeed-badge">{c.stage >= 4 ? "Approved" : "For review"}</span>
              <CommentCount n={c.comments.length} />
            </button>
          );
        })}
        {live.map((p) => (
          <LiveTile key={p.id} post={p} onOpen={() => setOpenPost(p)} />
        ))}
        {/* Until the client's Instagram is connected: placeholders for their
            real posts, as the Review page's Feed Preview shows. */}
        {Array.from({ length: empties }).map((_, i) => (
          <div key={`empty-${i}`} className="feedgrid-tile-empty">
            <EmptyTileArt loading={liveLoading} />
          </div>
        ))}
        {liveFeed && <LoadMore {...controller.liveMore} />}
      </div>
    </div>
  );
}

// Content or Feed, on a phone, named as the desktop's menu names them.
export function ReviewViewSwitch({ controller }: { controller: ReviewController }) {
  return (
    <div className="seg2 reviewviews" role="group" aria-label="View">
      <button type="button" aria-pressed={controller.view === "post"} onClick={() => controller.setView("post")}>
        Content
      </button>
      <button type="button" aria-pressed={controller.view === "feed"} onClick={() => controller.setView("feed")}>
        Feed
      </button>
    </div>
  );
}
