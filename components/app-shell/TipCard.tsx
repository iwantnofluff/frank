"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useIsStaff } from "@/hooks/use-is-staff";
import { useMarkTipShown, useMyTips, useTipTargets } from "@/hooks/use-tips";
import { usePresence } from "@/hooks/use-presence";
import { nextTip, tipDue, type Tip } from "@/lib/tips";
import { openHelpArticle } from "./HelpPanel";
import { TIP_SPOT_EVENT } from "./TipSpotlight";

const SHOW_MS = 5000;

// A tip, top right for 5 seconds (direct instruction): the team only, as
// often as each person has set (phase116), sliding in and out as the Help
// panel does. It waits while the pointer is on it. See it in Action goes to
// the feature, Read More opens its Help article.
export function TipCard() {
  const { isStaff, isPending } = useIsStaff();
  const enabled = isStaff && !isPending;
  const { data: tips } = useMyTips(enabled);
  const mark = useMarkTipShown();
  const router = useRouter();
  const pathname = usePathname();

  // Checked as Frank opens, then each minute, for the hourly settings.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const [current, setCurrent] = useState<Tip | null>(null);
  const [open, setOpen] = useState(false);
  const [hovering, setHovering] = useState(false);
  // When this tab last showed one, so a slow save can't bring the next
  // straight after.
  const [shownAt, setShownAt] = useState<string | null>(null);

  const lastAt = [tips?.lastAt, shownAt].filter((x): x is string => !!x).sort().pop() ?? null;
  const due = !!tips && !current && tipDue(tips.everyHours, lastAt, now) ? nextTip(tips.seen) : null;
  if (due) {
    setCurrent(due);
    setOpen(true);
    setShownAt(now.toISOString());
  }

  // Seen as soon as it shows, so a reload doesn't bring it back.
  const { mutate } = mark;
  const seen = tips?.seen;
  useEffect(() => {
    if (current && seen) mutate({ id: current.id, seen });
    // Once per tip shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  useEffect(() => {
    if (!open || hovering) return;
    const t = setTimeout(() => setOpen(false), SHOW_MS);
    return () => clearTimeout(t);
  }, [open, hovering]);

  const pop = usePresence(open ? current : null);
  // Gone once it's slid out, ready for the next when it's due.
  const closed = !open && !pop.shown && current;
  if (closed) setCurrent(null);

  const projectHere = pathname.match(/^\/projects\/([^/]+)/)?.[1] ?? null;
  const { data: targets } = useTipTargets(enabled && !!current && current.place !== "here");
  const tip = pop.shown;
  if (!tip) return null;

  const projectId = projectHere ?? targets?.projectId ?? null;
  const href =
    tip.place === "new-post" && projectId
      ? `/projects/${projectId}?new=1&tip=${tip.id}`
      : tip.place === "new-row" && projectId
        ? `/projects/${projectId}?row=1&tip=${tip.id}`
        : tip.place === "table" && projectId
          ? `/projects/${projectId}?tip=${tip.id}`
          : tip.place === "post-content" && targets?.postId
            ? `/creatives/${targets.postId}?edit=upload&tip=${tip.id}`
            : null;
  const canShow = tip.place === "here" || !!href;

  return (
    <div
      className={`tipcard${pop.isOpen ? " is-open" : ""}`}
      role="status"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className="tipcard-h">
        <svg className="aicon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3z" />
        </svg>
        <span className="tipcard-k">Tip</span>
        <button type="button" className="tipcard-x" aria-label="Close tip" onClick={() => setOpen(false)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <b className="tipcard-t">{tip.title}</b>
      <p className="tipcard-p">{tip.text}</p>
      <div className="tipcard-a">
        {canShow && (
          <button
            type="button"
            className="btn sm primary"
            onClick={() => {
              setOpen(false);
              if (href) router.push(href);
              else window.dispatchEvent(new CustomEvent(TIP_SPOT_EVENT, { detail: { id: tip.id } }));
            }}
          >
            See it in Action
          </button>
        )}
        <button
          type="button"
          className="linkbtn"
          onClick={() => {
            setOpen(false);
            openHelpArticle(tip.articleId);
          }}
        >
          Read More
        </button>
      </div>
    </div>
  );
}
