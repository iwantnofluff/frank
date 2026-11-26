"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useCreateComment } from "@/hooks/use-create-comment";
import { errorMessage } from "@/lib/errors";
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
  add,
  beside,
  writeFor,
}: {
  feedback: PostFeedback | undefined;
  expanded: boolean;
  onToggle: () => void;
  // The client's in Client Feedback's red.
  tone?: "client";
  // Add Feedback (direct instruction): a client's, straight into the
  // post's comment box. None where the viewer can't comment.
  add?: { href: string; label: string };
  // Approve Concept, beside it (direct instruction).
  beside?: React.ReactNode;
  // The post a client writes feedback on in the cell itself (direct
  // instruction), where they can comment.
  writeFor?: string;
}) {
  const [hover, setHover] = useState<DOMRect | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const later = (fn: () => void) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fn, 200);
  };
  const latest = feedback?.latest;
  const all = feedback?.all ?? [];
  const addButton = (add || beside) && (
    <span className="fb-acts">
      {add && (
    <Link
      href={add.href}
      // Update's chip and arrow (MissingContent's EditContent).
      className="copychip tedit-btn addfb-btn"
      title={`${add.label} on the post`}
      // Not the row's own click, which opens the post's page.
      onClick={(e) => e.stopPropagation()}
    >
      {add.label}
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 17L17 7M9 7h8v8" />
      </svg>
    </Link>
      )}
      {beside}
    </span>
  );
  const write = writeFor && <FeedbackWrite creativeId={writeFor} />;
  if (!latest && !all.length)
    return write || addButton ? (
      <>
        {write}
        {addButton}
      </>
    ) : (
      <span className="tdim">—</span>
    );
  return (
    <>
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
    {/* Under the comment, not in its red (direct instruction). */}
    {write}
    {addButton}
    </>
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

// Written in the cell (direct instruction): a new comment on the post, as
// if written on its page, posted with Enter (Shift+Enter for a new line)
// or Post. It shows above once saved, as the client's latest.
function FeedbackWrite({ creativeId }: { creativeId: string }) {
  const [body, setBody] = useState("");
  const create = useCreateComment(creativeId);
  const post = () => {
    const text = body.trim();
    if (!text || create.isPending) return;
    create.mutate({ body: text, parentId: null, visibility: "public" }, { onSuccess: () => setBody("") });
  };
  return (
    // Not the row's own click, which opens the post's page.
    <span className="fb-write" onClick={(e) => e.stopPropagation()}>
      <textarea
        className="cxin fb-in"
        rows={1}
        placeholder="Write feedback…"
        aria-label="Write feedback"
        value={body}
        disabled={create.isPending}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            post();
          }
          if (e.key === "Escape") setBody("");
        }}
      />
      {body.trim() && (
        <button type="button" className="copychip fb-post" disabled={create.isPending} onClick={post}>
          {create.isPending ? "Posting…" : "Post"}
        </button>
      )}
      {create.error && <span className="autherr tiny">{errorMessage(create.error, "Couldn't post that")}</span>}
    </span>
  );
}
