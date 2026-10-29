"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CreativeListRow } from "@/hooks/use-creatives";
import { useCopyVersionsByCreative } from "@/hooks/use-copy-versions-by-creative";
import { useAssetLinksByCreative } from "@/hooks/use-asset-links";
import { useLatestFeedbackByCreative } from "@/hooks/use-latest-feedback-by-creative";
import { useProjectStatuses } from "@/hooks/use-project-statuses";
import { canApproveConcept } from "@/hooks/use-approve-concept";
import { statusOptions } from "@/lib/project-statuses";
import { exceptionLabel, isIdea, stageColor, stageLabel } from "@/lib/stage-labels";
import { publishDate } from "@/lib/publish-date";
import { formatsLabel, postFormats } from "@/lib/formats";
import { matchesFilter, ALL_STATUSES, PLATFORM_FILTERS, type PlatformFilter } from "@/lib/post-filters";
import { CopyCaptionChip } from "@/components/project/CopyCaptionChip";
import { OpenAsset } from "@/components/project/OpenAsset";
import { ApproveConceptButton } from "@/components/project/ApproveConceptButton";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// A project on a phone (direct instruction): its posts as cards, a month at
// a time, in date order, for copying captions and opening Final Assets. Each
// card: its date and stage (the team's status within it), its name opening
// the post, its caption with Copy Caption, Final Asset for the team, Approve
// Concept while one waits, and the client's latest feedback. The table's
// columns, views, Week and Calendar, selecting and changing stage stay on a
// computer, and so do Ideas (no date to file them under).
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

  const posts = useMemo(
    () =>
      creatives
        .filter((c) => !isIdea(c) && dateOf(c) && matchesFilter(c, { statuses: ALL_STATUSES, platform }))
        .map((c) => ({ c, dt: new Date(delivery === "continuous" ? `${c.due_on}T00:00:00` : (c.scheduled_at as string)) }))
        .filter(({ dt }) => dt.getFullYear() === anchor.getFullYear() && dt.getMonth() === anchor.getMonth())
        .sort((a, b) => a.dt.getTime() - b.dt.getTime())
        .map(({ c }) => c),
    // dateOf reads only delivery.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [creatives, delivery, platform, anchor],
  );
  const ids = useMemo(() => posts.map((c) => c.id), [posts]);
  const { data: copies } = useCopyVersionsByCreative(ids);
  const { data: assetLinks } = useAssetLinksByCreative(ids, isStaff);
  const { data: feedback } = useLatestFeedbackByCreative(ids);
  const { data: statuses } = useProjectStatuses(projectId, isStaff);

  const step = (by: number) => setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + by, 1));

  return (
    <div className="mproj">
      <div className="mproj-bar">
        <div className="mproj-month">
          <button type="button" className="m-arrow" aria-label="Previous month" onClick={() => step(-1)}>
            <svg viewBox="0 0 24 24">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <b>
            {MONTH_NAMES[anchor.getMonth()]} {anchor.getFullYear()}
          </b>
          <button type="button" className="m-arrow" aria-label="Next month" onClick={() => step(1)}>
            <svg viewBox="0 0 24 24">
              <path d="M9 18l6-6-6-6" />
            </svg>
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

      {posts.map((c) => {
        const caption = copies?.[c.id]?.[0]?.caption?.trim() ? copies[c.id][0].caption! : null;
        const status = isStaff ? statusOptions(statuses, c.stage).find((o) => o.id === c.status_id) : undefined;
        const latest = feedback?.[c.id]?.latest;
        return (
          <article className="mproj-card" key={c.id}>
            <div className="mproj-top">
              <span className="mproj-date">{publishDate(delivery, c.scheduled_at, c.due_on)}</span>
              <span className="stg" style={{ background: stageColor(c.stage, c.exception ?? null) }}>
                {c.exception ? exceptionLabel(c.exception) : (status?.text ?? `${c.stage}. ${stageLabel(c.stage, delivery)}`)}
              </span>
            </div>
            <Link className="mproj-name" href={`/creatives/${c.id}`}>
              {c.name}
            </Link>
            <span className="mproj-fmt">{formatsLabel(postFormats(c))}</span>
            {caption && <p className="mproj-cap">{caption}</p>}
            {latest && (
              <div className="mproj-fb feedback-note">
                <span className="cc-v">
                  {latest.name}
                  {latest.name ? " · " : ""}
                  {when(latest.createdAt)}
                </span>
                <span>{latest.body}</span>
              </div>
            )}
            {(caption || (isStaff && assetLinks?.[c.id]) || canApproveConcept(c)) && (
              <div className="mproj-acts">
                {caption && <CopyCaptionChip caption={caption} label="Copy Caption" className="btn mpost-copy" />}
                {isStaff && assetLinks?.[c.id] && <OpenAsset url={assetLinks[c.id]} className="mpost-asset" />}
                {canApproveConcept(c) && <ApproveConceptButton creativeId={c.id} />}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
