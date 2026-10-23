"use client";

import { useRef, useState } from "react";
import type { PostNotes } from "@/hooks/use-designer-notes";
import { ClampText } from "@/components/project/ClampText";
import { EditContent, MissingContent } from "@/components/project/MissingContent";
import { CopyVersionHistoryPopover } from "@/components/project/CopyVersionHistoryPopover";
import { NotesText } from "@/components/creative-review/NotesText";

// A post's Notes for Designer in the table (both tables, direct
// instruction): its latest version with its V label, the headings neatened
// (NotesText), each image's own after it, all under one Read more, and
// earlier versions on hover of
// "+N earlier", as the Caption column shows its copy (phase117).
export function NotesCell({
  notes,
  expanded,
  onToggle,
  onFill,
}: {
  notes: PostNotes | undefined;
  expanded: boolean;
  onToggle: () => void;
  onFill?: () => void;
}) {
  const [hover, setHover] = useState<DOMRect | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const later = (fn: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fn, 200);
  };

  const overall = notes?.overall.trim() ?? "";
  const slides = notes?.slides ?? [];
  const hasSlides = slides.some((n) => n.trim());
  if (!notes || (!overall && !hasSlides)) return <MissingContent expected onFill={onFill} addLabel="Notes" />;

  const rows = [
    { versionNo: notes.versionNo, text: overall, node: <NotesText text={overall || "—"} /> },
    ...notes.earlier.map((v) => ({ versionNo: v.versionNo, text: v.overall, node: <NotesText text={v.overall || "—"} /> })),
  ];

  return (
    <span className="copyc">
      <span className="cc-v">V{notes.versionNo}</span>
      {/* The overall note and each image's own in one clamp, so Read
          more opens them all (direct instruction). */}
      <ClampText expanded={expanded} onToggle={onToggle} after={<EditContent onFill={onFill} label="Notes for Designer" />}>
        {overall && <NotesText text={overall} />}
        {hasSlides && (
          <span className="ntext nt-slides">
            {slides.map((n, i) =>
              n.trim() ? (
                <span key={i} className="nt-p">
                  <b>Slide {i + 1}:</b> {n}
                </span>
              ) : null,
            )}
          </span>
        )}
      </ClampText>
      {notes.earlier.length > 0 && (
        <span
          className="cc-n"
          onMouseEnter={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            later(() => setHover(rect));
          }}
          onMouseLeave={() => later(() => setHover(null))}
        >
          +{notes.earlier.length} earlier
        </span>
      )}
      {hover && (
        <CopyVersionHistoryPopover
          label="Notes for Designer"
          rows={rows}
          anchorRect={hover}
          onMouseEnter={() => timer.current && clearTimeout(timer.current)}
          onMouseLeave={() => later(() => setHover(null))}
        />
      )}
    </span>
  );
}
