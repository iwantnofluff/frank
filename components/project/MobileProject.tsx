"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CreativeListRow } from "@/hooks/use-creatives";
import { useCopyVersionsByCreative } from "@/hooks/use-copy-versions-by-creative";
import { useAssetLinksByCreative } from "@/hooks/use-asset-links";
import { useProjectStatuses, type ProjectStatus } from "@/hooks/use-project-statuses";
import { canApproveConcept } from "@/hooks/use-approve-concept";
import { statusOptions } from "@/lib/project-statuses";
import { exceptionLabel, isIdea, stageColor, stageLabel } from "@/lib/stage-labels";
import { publishDate } from "@/lib/publish-date";
import { formatsLabel, postFormats } from "@/lib/formats";
import { matchesFilter, ALL_STATUSES, PLATFORM_FILTERS, type PlatformFilter } from "@/lib/post-filters";
import { CopyCaptionChip } from "@/components/project/CopyCaptionChip";
import { OpenAsset } from "@/components/project/OpenAsset";
import { ApproveConceptButton } from "@/components/project/ApproveConceptButton";
import { StagePillMenu } from "@/components/project/StagePillMenu";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// A project on a phone (direct instruction): its posts as cards, a month at
// a time, in date order, for copying captions and opening Final Assets. Each
// card: its date and stage (the team's status within it), its name, its
// caption on one line with See more (direct instruction), and Copy Caption,
// Final Asset for the team, See Post and Approve Concept while one waits.
// The team moves a post's stage from its pill, as in the table (direct
// instruction). Today (direct instruction) goes to today's posts, else the
// latest day before with one. No comments here (direct instruction): they're
// on the post. The table's columns, views, Week and Calendar and selecting
// stay on a computer, and so do Ideas (no date to file them under).
export function MobileProject({
  creatives,
  delivery,
  isStaff,
  projectId,
}: {
  // The project's active posts.
  creatives: CreativeListRow[];
  delivery: "scheduled" | "continuous";
  isStaff: boolean;
  projectId: string;
}) {
  const [anchor, setAnchor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [platform, setPlatform] = useState<PlatformFilter>("all");
  const dateOf = (c: CreativeListRow) => (delivery === "continuous" ? c.due_on : c.scheduled_at);

  // Every dated post the platform shows, in date order.
  const dated = useMemo(
    () =>
      creatives
        .filter((c) => !isIdea(c) && dateOf(c) && matchesFilter(c, { statuses: ALL_STATUSES, platform }))
        .map((c) => ({ c, dt: new Date(delivery === "continuous" ? `${c.due_on}T00:00:00` : (c.scheduled_at as string)) }))
        .sort((a, b) => a.dt.getTime() - b.dt.getTime()),
    // dateOf reads only delivery.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [creatives, delivery, platform],
  );
  const posts = useMemo(
    () =>
      dated
        .filter(({ dt }) => dt.getFullYear() === anchor.getFullYear() && dt.getMonth() === anchor.getMonth())
        .map(({ c }) => c),
    [dated, anchor],
  );
  const ids = useMemo(() => posts.map((c) => c.id), [posts]);
  const { data: copies } = useCopyVersionsByCreative(ids);
  const { data: assetLinks } = useAssetLinksByCreative(ids, isStaff);
  const { data: statuses } = useProjectStatuses(projectId, isStaff);

  const step = (by: number) => setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + by, 1));

  // Today: the first post on the latest day up to today, in its month;
  // with none before, this month from the top.
  const [goTo, setGoTo] = useState<{ id: string | null } | null>(null);
  const today = () => {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const last = [...dated].reverse().find(({ dt }) => dt < end);
    const day = last && dated.find(({ dt }) => dt.toDateString() === last.dt.toDateString());
    const at = day ? day.dt : now;
    setAnchor(new Date(at.getFullYear(), at.getMonth(), 1));
    setGoTo({ id: day ? day.c.id : null });
  };
  const root = useRef<HTMLDivElement>(null);
  const went = useRef<typeof goTo>(null);
  useEffect(() => {
    if (!goTo || went.current === goTo) return;
    went.current = goTo;
    const card = goTo.id ? root.current?.querySelector(`[data-post="${goTo.id}"]`) : root.current;
    card?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [goTo, posts]);

  return (
    <div className="mproj" ref={root}>
      <div className="mproj-bar">
        <div className="mproj-month">
          <button type="button" className="m-arrow" aria-label="Previous month" onClick={() => step(-1)}>
            <svg viewBox="0 0 24 24">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <b>
            {MONTH_NAMES[anchor.getMonth()].slice(0, 3)} {anchor.getFullYear()}
          </b>
          <button type="button" className="m-arrow" aria-label="Next month" onClick={() => step(1)}>
            <svg viewBox="0 0 24 24">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
          <button type="button" className="mproj-today" onClick={today}>
            Today
          </button>
        </div>
        <select
          className="mproj-platform"
          aria-label="Platform"
          value={platform}
          onChange={(e) => setPlatform(e.target.value as PlatformFilter)}
        >
          {PLATFORM_FILTERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {posts.length === 0 && (
        <div className="empty">
          <b>No posts in {MONTH_NAMES[anchor.getMonth()]}</b>
          <span>Use the arrows to see another month.</span>
        </div>
      )}

      {posts.map((c) => (
        <PostCard
          key={c.id}
          post={c}
          delivery={delivery}
          statuses={isStaff ? statuses : null}
          caption={copies?.[c.id]?.[0]?.caption?.trim() ? copies[c.id][0].caption! : null}
          stageText={
            c.exception
              ? exceptionLabel(c.exception)
              : ((isStaff ? statusOptions(statuses, c.stage).find((o) => o.id === c.status_id)?.text : undefined) ??
                `${c.stage}. ${stageLabel(c.stage, delivery)}`)
          }
          assetLink={isStaff ? (assetLinks?.[c.id] ?? null) : null}
        />
      ))}
    </div>
  );
}

// One post's card. Its caption is one line until See more opens the rest,
// offered only when there's more than fits.
function PostCard({
  post: c,
  delivery,
  statuses,
  caption,
  stageText,
  assetLink,
}: {
  post: CreativeListRow;
  delivery: "scheduled" | "continuous";
  // The project's statuses, for the team's pill; null for a client's.
  statuses: ProjectStatus[] | undefined | null;
  caption: string | null;
  stageText: string;
  assetLink: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const cap = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const el = cap.current;
    if (!el || open) return;
    const measure = () => setMore(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [caption, open]);

  return (
    <article className="mproj-card" data-post={c.id}>
      <div className="mproj-top">
        <span className="mproj-date">{publishDate(delivery, c.scheduled_at, c.due_on)}</span>
        {statuses !== null ? (
          <span className="mproj-stage">
            <StagePillMenu post={c} statuses={statuses} delivery={delivery} color={stageColor(c.stage, c.exception ?? null)} />
          </span>
        ) : (
          <span className="stg" style={{ background: stageColor(c.stage, c.exception ?? null) }}>
            {stageText}
          </span>
        )}
      </div>
      <b className="mproj-name">{c.name}</b>
      <span className="mproj-fmt">{formatsLabel(postFormats(c))}</span>
      {caption && (
        <>
          <p ref={cap} className={`mproj-cap${open ? " open" : ""}`}>
            {caption}
          </p>
          {(more || open) && (
            <button type="button" className="mproj-more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {open ? "See less" : "See more"}
            </button>
          )}
        </>
      )}
      <div className="mproj-acts">
        {caption && <CopyCaptionChip caption={caption} label="Copy Caption" className="btn mpost-copy" />}
        {assetLink && <OpenAsset url={assetLink} className="mpost-asset" />}
        <Link className="btn mproj-see" href={`/creatives/${c.id}`}>
          See Post
        </Link>
        {canApproveConcept(c) && <ApproveConceptButton creativeId={c.id} />}
      </div>
    </article>
  );
}
