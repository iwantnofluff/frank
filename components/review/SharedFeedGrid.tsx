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

// Each tile's stage, named and coloured as the Review page's stage switch
// names and colours them (direct instruction): Internal Review (Concept
// counts as it there too), Client Review, Approved.
function StagePill({ stage }: { stage: number }) {
  const [label, tone] = stage >= 4 ? ["Approved", "approved"] : stage === 3 ? ["Client Review", "client"] : ["Internal Review", "internal"];
  return <span className={`stagepill ${tone}`}>{label}</span>;
}

// A review link's Feed (phase54, then phase67): the client's profile, the
// project's posts in grid order, then the client's real posts once their
// Instagram is connected (placeholders until then, as on the Review page).
// The posts this link shares show their thumbnail, open on a click and show
// how many comments they have; every other post is a tile with its stage
// (and its name while in Internal Review). Every tile carries its stage pill.
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
                {/* Named while in Internal Review (phase68); otherwise its
                    stage alone. */}
                {e.name && <span className="sharedfeed-name">{e.name}</span>}
                <StagePill stage={e.stage} />
              </div>
            );
          }
          const url = c.asset?.signed_url ?? null;
          const video = !!c.asset?.mime_type.startsWith("video/");
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
              {/* Its thumbnail (direct instruction): the image, or a video's
                  first frame, as the Review page's Feed Preview shows them. */}
              {url && video ? (
                <video src={`${url}#t=0.1`} muted playsInline preload="metadata" aria-label={c.name} />
              ) : url ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
                <img src={url} alt={c.name} />
              ) : (
                <span className="sharedfeed-name">{c.name}</span>
              )}
              <StagePill stage={c.stage} />
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
