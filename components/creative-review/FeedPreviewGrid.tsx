"use client";

import { isIdea } from "@/lib/stage-labels";
import { isLive, isOverdue } from "@/lib/post-live";
import { useMemo, useRef, useState } from "react";
import { useCreatives, type CreativeListRow } from "@/hooks/use-creatives";
import { FeedTileArt, EmptyTileArt } from "@/components/creative-review/FeedTileArt";
import { StagePill } from "@/components/creative-review/StagePill";
import { FeedCaptionPopover } from "@/components/creative-review/FeedCaptionPopover";
import { PhoneFrame } from "./PhoneFrame";
import { useClientInstagramFeed } from "@/hooks/use-instagram";
import { LoadMore } from "@/components/creative-review/LoadMore";
import { FeedProfile, FeedTabs, LiveTile, type FeedTab } from "@/components/creative-review/FeedChrome";
import { LivePostView } from "@/components/creative-review/LivePostView";
import { useClientInstagramSlides } from "@/hooks/use-instagram";
import type { LiveFeed } from "@/lib/instagram/store";
import { postFormats } from "@/lib/formats";
import { useClientLogoUrl } from "@/hooks/use-client-logo-url";

const GRID_SLOTS = 9;

// The 2nd reference mockup (a plain Instagram grid, header+tabs above it) —
// every other creative in this project, per direct instruction (not the
// whole client: this page is scoped to one project's work, and pooling
// every project would mix in posts nothing here is reviewing). Real
// artwork per tile where one's been uploaded (FeedTileArt), a plain
// "No Creative"/"Live Post" label otherwise — see FeedTileArt.tsx for
// which is which and why.
//
// The header/tabs chrome (.fp-h/.fp-tabs) is the prototype's own
// #feedPanel markup (frank-prototype.html) — that feature (a live
// Instagram-connected grid) was deferred (docs/parity-gaps.md), but its
// static header/tab-row chrome is exactly what this mockup asks for, so
// it's ported now rather than redrawn from scratch. Only "Posts" has
// anything behind it here — Reels/Saved/Tagged are the prototype's own
// tabs with no Frank feature backing them, so they're plain, non-clickable
// chrome (not real buttons) rather than dead buttons that do nothing.
export function FeedPreviewGrid({
  projectId,
  clientId,
  activeCreativeId,
  brandName,
  onSelect,
}: {
  projectId: string;
  // Its client's connected Instagram (phase54): the real header and posts.
  clientId: string | null;
  activeCreativeId: string;
  brandName: string;
  onSelect: (creativeId: string) => void;
}) {
  const { data: allCreatives, isLoading } = useCreatives(projectId);
  // Deleted (archived_at) posts never show here — useCreatives now
  // returns them too, for the project page's own Active/Archived toggle.
  // Newest first, as Instagram's grid reads (direct instruction: they were
  // in the planner's order, oldest first): by Publish Date, or a continuous
  // project's Live Date. Ideas (no date yet) are left out.
  const creatives = useMemo(() => {
    const when = (c: CreativeListRow) => {
      const at = c.scheduled_at ?? (c.due_on ? `${c.due_on}T00:00:00` : null);
      return at ? new Date(at).getTime() : Infinity;
    };
    // Ideas aren't on the Review page (direct instruction).
    return (allCreatives ?? [])
      .filter((c) => !c.archived_at && !isIdea(c))
      .map((c, i) => ({ c, i, t: when(c) }))
      .sort((a, b) => (a.t === b.t ? a.i - b.i : b.t - a.t))
      .map(({ c }) => c);
  }, [allCreatives]);
  // The client's real feed, once connected (phase54): the planned posts
  // first, then the real ones after them, the way the grid will read once
  // these go live.
  // A page at a time as the grid scrolls, to the account's first post.
  const { data: pages, fetchNextPage, hasNextPage, isFetchingNextPage, isPending: liveLoading } =
    useClientInstagramFeed(clientId);
  const clientLogoUrl = useClientLogoUrl(clientId);
  const live = pages?.pages[0];
  const feed = live?.status === "ok" ? live.feed : null;
  // Posts, or just the Reels (a Reel-format plan, or a real Reel).
  const [tab, setTab] = useState<FeedTab>("posts");
  // A live post opened in the post view, over the grid (which keeps its
  // place underneath for Back).
  const [openPost, setOpenPost] = useState<LiveFeed["posts"][number] | null>(null);
  const slides = useClientInstagramSlides(clientId, openPost?.carousel ? openPost.id : null);
  const allLive = useMemo(
    () => (pages?.pages ?? []).flatMap((p) => (p.status === "ok" ? p.feed.posts : [])),
    [pages],
  );
  const livePosts = tab === "reels" ? allLive.filter((p) => p.reel) : allLive;
  // A post that's gone live (lib/post-live.ts: Approved, its date passed)
  // is already among the real posts once the client's Instagram is
  // connected, so it isn't shown twice (direct instruction). Without a
  // connection it stays, marked Live.
  const connected = !!feed;
  const [now] = useState(() => Date.now());
  // The post being looked at too: once it's live, the real one stands for
  // it, as for any other (direct instruction: it showed twice).
  const planned = connected ? creatives.filter((c) => !isLive(c, now)) : creatives;
  const shown = tab === "reels" ? planned.filter((c) => postFormats(c).includes("ig_reel")) : planned;

  // Same hover-preview pattern as ProjectCalendarTable's own creative
  // rows: a short delay before showing (so a pointer passing over several
  // tiles doesn't pop one open per tile) and before hiding (so the pointer
  // has time to cross from the tile onto the popover itself), which the
  // popover's own onMouseEnter/onMouseLeave then cancels/extends.
  const [hover, setHover] = useState<{ creative: CreativeListRow; rect: DOMRect } | null>(
    null,
  );
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleEnter(creative: CreativeListRow, target: HTMLElement) {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    const rect = target.getBoundingClientRect();
    hoverTimeout.current = setTimeout(() => setHover({ creative, rect }), 200);
  }
  function scheduleHide() {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setHover(null), 200);
  }
  function cancelHide() {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
  }

  return (
    <>
    {/* Inside a phone (direct instruction, from the user's iPhone
        template); the grid fills the screen and scrolls within it. */}
    <PhoneFrame>
    <div className="feedcard">
      {openPost && feed && (
        <LivePostView
          post={openPost}
          profile={feed.profile}
          slides={slides.data}
          slidesLoading={slides.isPending && !!openPost.carousel}
          onBack={() => setOpenPost(null)}
        />
      )}
      <FeedProfile
        profile={feed?.profile ?? null}
        fallbackName={brandName}
        logoUrl={clientLogoUrl}
        loading={!!clientId && liveLoading}
      />
      <FeedTabs tab={tab} onTab={setTab} />

      {isLoading ? (
        <div className="awaiting">
          <span>Frank is working…</span>
        </div>
      ) : (
        <div className={tab === "reels" ? "feedgrid reels" : "feedgrid"}>
          {shown.map((c) => {
            // Its Publish Date, or a continuous project's Live Date (read
            // as the day it names).
            const when = c.scheduled_at ?? (c.due_on ? `${c.due_on}T00:00:00` : null);
            const timeLabel = when
              ? new Date(when).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })
              : "—";
            return (
              <button
                key={c.id}
                type="button"
                className={`feedgrid-tile${c.published_at || isLive(c, now) ? "" : " not-live"}`}
                aria-current={c.id === activeCreativeId}
                onClick={() => onSelect(c.id)}
                onMouseEnter={(e) => handleEnter(c, e.currentTarget)}
                onMouseLeave={scheduleHide}
                title={c.name}
              >
                <FeedTileArt creative={c} timeLabel={timeLabel} overdue={isOverdue(c, now)} />
                {/* Its stage, as a review link's Feed shows it (direct
                    instruction: in place of "Planned", the two the same). */}
                {isLive(c, now) ? <span className="stagepill stg live">Live</span> : <StagePill stage={c.stage} />}
              </button>
            );
          })}
          {/* The client's real posts, after the planned ones (phase54).
              Each opens in the post view. */}
          {livePosts.map((p) => (
            <LiveTile key={p.id} post={p} onOpen={() => setOpenPost(p)} />
          ))}
          {/* Pad up to a fixed 9 slots — real empty tiles, not just blank
              space, per direct instruction. Never rendered when there are
              already 9+ real creatives; overflow scrolls instead. */}
          {Array.from({
            length: tab === "reels" ? 0 : Math.max(0, GRID_SLOTS - planned.length - livePosts.length),
          }).map((_, i) => (
            <div key={`empty-${i}`} className="feedgrid-tile-empty">
              <EmptyTileArt loading={!!clientId && liveLoading} />
            </div>
          ))}
          <LoadMore hasMore={!!hasNextPage} loading={isFetchingNextPage} onMore={() => fetchNextPage()} />
        </div>
      )}
      {live && live.status !== "ok" && (
        <p className="fp-note">
          {live.status === "not_connected"
            ? `Connect ${brandName}'s Instagram in Settings → Connections to show its real posts here.`
            : live.status === "needs_reconnect"
              ? `@${live.username} needs reconnecting in Settings → Connections to show its real posts.`
              : `Instagram didn't answer, so the real posts aren't showing: ${live.message}`}
        </p>
      )}
    </div>
    </PhoneFrame>
    {hover && (
      <FeedCaptionPopover
        creative={hover.creative}
        anchorRect={hover.rect}
        onMouseEnter={cancelHide}
        onMouseLeave={scheduleHide}
      />
    )}
    </>
  );
}
