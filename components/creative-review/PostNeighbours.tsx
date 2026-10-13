"use client";

import Link from "next/link";
import { useCreatives, type CreativeListRow } from "@/hooks/use-creatives";
import { formatsLabel, postFormats } from "@/lib/formats";
import { publishDate } from "@/lib/publish-date";

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

// Arrows either side of the phone on a post's page (direct instruction),
// each naming the post it opens: its date, title and format. A side with no
// post keeps its room, so the phone stays centred.
export function PostNeighbours({
  creativeId,
  projectId,
  delivery,
  children,
}: {
  creativeId: string;
  projectId: string;
  delivery: Delivery;
  children: React.ReactNode;
}) {
  const { data: rows } = useCreatives(projectId);
  const list = rows ? inDateOrder(rows, delivery) : [];
  const at = list.findIndex((c) => c.id === creativeId);
  const prev = at > 0 ? list[at - 1] : null;
  const next = at >= 0 && at < list.length - 1 ? list[at + 1] : null;

  const side = (c: CreativeListRow | null, dir: "prev" | "next") =>
    c ? (
      <Link
        href={`/creatives/${c.id}`}
        className={`pnav ${dir}`}
        aria-label={`${dir === "prev" ? "Previous" : "Next"} post: ${c.name}`}
        // The details on hover too, for when the canvas is narrow and only
        // the arrow shows.
        title={`${publishDate(delivery, c.scheduled_at, c.due_on) ?? "No date"} · ${c.name} · ${formatsLabel(postFormats(c))}`}
      >
        <span className="pnav-arrow" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d={dir === "prev" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
          </svg>
        </span>
        <span className="pnav-d">
          <span className="pnav-date">{publishDate(delivery, c.scheduled_at, c.due_on) ?? "No date"}</span>
          <b>{c.name}</b>
          <span className="pnav-fmt">{formatsLabel(postFormats(c))}</span>
        </span>
      </Link>
    ) : (
      <span className={`pnav ${dir} none`} aria-hidden="true" />
    );

  return (
    <div className="pnav-row">
      {side(prev, "prev")}
      {children}
      {side(next, "next")}
    </div>
  );
}
