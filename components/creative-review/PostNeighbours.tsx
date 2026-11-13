"use client";

import { isIdea } from "@/lib/stage-labels";
import Link from "next/link";
import { useCreatives, type CreativeListRow } from "@/hooks/use-creatives";
import { isHiddenPost, useHiddenStatusIds } from "@/hooks/use-stage-statuses";
import { formatsLabel, postFormats } from "@/lib/formats";
import { FormatSwitch } from "./FormatSwitch";
import { publishDate } from "@/lib/publish-date";
import { liveTiming } from "@/lib/post-live";
import { usePostLiveDate } from "@/hooks/use-post-live-date";

// The height of the current post's date, title and format above the phone,
// kept free when the phone sizes itself to the canvas.
export const PNAV_CURRENT_H = 64;

type Delivery = "scheduled" | "continuous" | null | undefined;

// The project's posts in date order (direct instruction: the previous and
// next post beside the phone), as the planner lists them: by Publish Date
// in a scheduled project, Live Date in a continuous one; posts with no date
// after, in the planner's own order. Archived ones are left out.
function inDateOrder(rows: CreativeListRow[], delivery: Delivery): CreativeListRow[] {
  const when = (c: CreativeListRow) => (delivery === "continuous" ? c.due_on : c.scheduled_at);
  return rows
    .filter((c) => !c.archived_at)
    .map((c, i) => ({ c, i, t: when(c) ? Date.parse(when(c)!) : Infinity }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map(({ c }) => c);
}

// Arrows either side of the phone on a post's page (direct instruction):
// the arrow steps to the previous or next post, and beside it that post's
// date, title and format open it too, each with its own hover. Both links
// prefetch the whole page (prefetch={true}; a page built per visit is
// otherwise not fetched ahead), so a click doesn't wait on the server
// (direct instruction: no lag). Only a production build prefetches. The
// current post's date and title sit above the phone. A side with no post
// keeps its room, so the phone stays centred.
export function PostNeighbours({
  creativeId,
  projectId,
  delivery,
  name,
  scheduledAt,
  dueOn,
  publishOn,
  formats,
  shownFormat,
  onShowFormat,
  wide = false,
  oldVersion = false,
  children,
}: {
  creativeId: string;
  projectId: string;
  delivery: Delivery;
  name: string;
  scheduledAt: string | null;
  dueOn: string | null;
  // An Other Content post's Publish Date: whether it went live on time is
  // against this (phase140).
  publishOn?: string | null;
  // The post's formats, main first.
  formats: string[];
  // Which of them the post is shown as, and choosing another.
  shownFormat?: string | null;
  onShowFormat?: (format: string) => void;
  // An iPad between them: the posts either side shrink to their arrows.
  wide?: boolean;
  // An earlier artwork or copy version is showing.
  oldVersion?: boolean;
  children: React.ReactNode;
}) {
  const { data: rows } = useCreatives(projectId);
  // A post on a status that hides it (phase143) is stepped over, unless
  // it's the one open.
  const { data: hiddenStatuses, isPending: hiddenPending } = useHiddenStatusIds();
  // When it really went live, after its planned date: green on time, red
  // late (phase99, direct instruction).
  const { data: live } = usePostLiveDate(creativeId);
  const timing = live ? liveTiming({ scheduled_at: scheduledAt, due_on: dueOn, publish_on: publishOn }, delivery, live.live_at) : null;
  const liveDate = live ? publishDate("scheduled", live.live_at, null) : null;
  // Ideas aren't on the Review page (direct instruction): only dated posts.
  // Not until it's known which are hidden, so a hidden one never shows.
  const list = rows && !hiddenPending
    ? inDateOrder(rows.filter((c) => !isIdea(c) && (c.id === creativeId || !isHiddenPost(c, hiddenStatuses))), delivery)
    : [];
  const at = list.findIndex((c) => c.id === creativeId);
  const prev = at > 0 ? list[at - 1] : null;
  const next = at >= 0 && at < list.length - 1 ? list[at + 1] : null;

  const side = (c: CreativeListRow | null, dir: "prev" | "next") => {
    if (!c) return <span className={`pnav ${dir} none`} aria-hidden="true" />;
    const date = publishDate(delivery, c.scheduled_at, c.due_on) ?? "No date";
    const label = dir === "prev" ? "Previous post" : "Next post";
    return (
      <div className={`pnav ${dir}`}>
        <Link
          href={`/creatives/${c.id}`}
          prefetch={true}
          className="pnav-arrow"
          aria-label={`${label}: ${c.name}`}
          // The details on hover too, for when the canvas is narrow and only
          // the arrow shows.
          title={`${date} · ${c.name} · ${formatsLabel(postFormats(c))}`}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={dir === "prev" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
          </svg>
        </Link>
        {/* Read only (direct instruction): the arrow is what opens the post. */}
        <div className="pnav-d" aria-hidden="true">
          <span className="pnav-date">{date}</span>
          <b>{c.name}</b>
          <span className="pnav-fmt">{formatsLabel(postFormats(c))}</span>
        </div>
      </div>
    );
  };

  return (
    <div className={`pnav-row${wide ? " wide" : ""}`}>
      {side(prev, "prev")}
      <div className="pnav-mid">
        <div className="pnav-cur">
          <span className="pnav-date">
            {publishDate(delivery, scheduledAt, dueOn) ?? "No date"}
            {liveDate && (
              <>
                {" "}
                <span
                  className={`pnav-live${timing ? ` ${timing}` : ""}`}
                  title={`Went live ${liveDate}${timing === "late" ? ", late" : timing === "on_time" ? ", on time" : ""}${live?.source === "manual" ? " (set by hand)" : ""}`}
                >
                  ({liveDate})
                </span>
              </>
            )}
          </span>
          <b>{name}</b>
          {/* Its type and format too (direct instruction), and Old Version in
              red after a separator while an earlier artwork or copy version
              is showing (direct instruction). */}
          <span className="pnav-fmtline">
            <FormatSwitch className="pnav-fmt" formats={formats} shown={shownFormat ?? formats[0] ?? null} onShow={onShowFormat} />
            {oldVersion && (
              <>
                <span className="pnav-sep" aria-hidden="true" />
                <span className="pnav-old">Old Version</span>
              </>
            )}
          </span>
        </div>
        {children}
      </div>
      {side(next, "next")}
    </div>
  );
}
