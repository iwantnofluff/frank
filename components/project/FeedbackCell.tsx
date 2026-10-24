"use client";

import { useRef, useState } from "react";
import type { PostFeedback } from "@/hooks/use-latest-feedback-by-creative";
import { ClampText } from "@/components/project/ClampText";
import { useViewportFit } from "@/hooks/use-viewport-fit";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

// A post's Internal or Client Feedback in the table (direct instruction):
// the latest open comment, its author and when above it, clamped with Read
// more; and Show All, opening every comment from that side, newest first,
// on hover, as Caption's "+N earlier" does.
export function FeedbackCell({
  feedback,
  expanded,
  onToggle,
  tone,
}: {
  feedback: PostFeedback | undefined;
  expanded: boolean;
  onToggle: () => void;
  // The client's in Client Feedback's red.
  tone?: "client";
}) {
  const [hover, setHover] = useState<DOMRect | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const later = (fn: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fn, 200);
  };
  const latest = feedback?.latest;
  const all = feedback?.all ?? [];
  if (!latest && !all.length) return <span className="tdim">—</span>;
  return (
    <span className={`copyc${tone === "client" ? " feedback-note" : ""}`}>
      {latest ? (
        <>
          <span className="cc-v">
            {latest.name}
            {latest.name ? " · " : ""}
            {when(latest.createdAt)}
          </span>
          <ClampText expanded={expanded} onToggle={onToggle}>
            {latest.body}
          </ClampText>
        </>
      ) : (
        <span className="tdim">All resolved</span>
      )}
      {(all.length > 1 || (!latest && all.length > 0)) && (
        <span
          className="cc-n"
          onMouseEnter={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            later(() => setHover(rect));
          }}
          onMouseLeave={() => later(() => setHover(null))}
        >
          Show All ({all.length})
        </span>
      )}
      {hover && (
        <FeedbackPopover
          all={all}
          anchorRect={hover}
          onMouseEnter={() => timer.current && clearTimeout(timer.current)}
          onMouseLeave={() => later(() => setHover(null))}
        />
      )}
    </span>
  );
}

function FeedbackPopover({
  all,
  anchorRect,
  onMouseEnter,
  onMouseLeave,
}: {
  all: PostFeedback["all"];
  anchorRect: DOMRect;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useViewportFit(ref, anchorRect, { side: "below" });
  return (
    <div ref={ref} className="copypop on" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      {all.map((c, i) => (
        <div className={`cp-row${i === 0 && !c.resolved ? " live" : ""}`} key={`${c.createdAt}-${i}`}>
          <b>
            {c.name || "Someone"} · {when(c.createdAt)}
            {c.resolved ? " · Resolved" : ""}
          </b>
          <span className="cp-body">{c.body}</span>
        </div>
      ))}
    </div>
  );
}
