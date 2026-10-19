"use client";

import { useEffect, useRef, useState } from "react";
import { DateField, TimeField } from "@/components/ui/DateField";
import { useViewportFit } from "@/hooks/use-viewport-fit";
import { useReschedulePost } from "@/hooks/use-reschedule-post";
import { errorMessage } from "@/lib/errors";

// A post's date and time changed from a project's table (direct
// instruction: hover and click the date). A scheduled post's Publish Date
// and time, or a continuous post's Live Date; Frank's own date and time
// dropdowns (components/ui/DateField), the one clicked opened straight
// away. Enter saves; Escape closes.
export function DatePopover({
  creativeId,
  name,
  anchorRect,
  delivery,
  value,
  focus,
  onClose,
}: {
  creativeId: string;
  name: string;
  anchorRect: DOMRect;
  delivery: "scheduled" | "continuous";
  // A scheduled post's scheduled_at (ISO), or a continuous one's due_on;
  // empty for an Idea, which gets its first date here.
  value: string;
  // Which was clicked: its picker opens first.
  focus: "date" | "time";
  onClose: () => void;
}) {
  const scheduled = delivery === "scheduled";
  const at = scheduled && value ? new Date(value) : null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const [date, setDate] = useState(
    at ? `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` : value.slice(0, 10),
  );
  // An Idea's first time: 9am, as a new post's is.
  const [time, setTime] = useState(at ? `${pad(at.getHours())}:${pad(at.getMinutes())}` : scheduled ? "09:00" : "");
  const reschedule = useReschedulePost();
  const ref = useRef<HTMLDivElement>(null);
  useViewportFit(ref, anchorRect, { side: "below", gap: 4, align: "start" });

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Element;
      if (t.closest?.(".caldrop")) return;
      if (ref.current && !ref.current.contains(t)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // A date cleared and saved takes it off (reported directly: Save stayed
  // greyed): the post becomes an Idea, under the weeks. Nothing to save
  // when an Idea is left without one.
  const ready = date ? !scheduled || !!time : !!value;
  function save() {
    if (!ready || reschedule.isPending) return;
    reschedule.mutate(
      scheduled
        ? { creativeId, scheduledAt: date ? new Date(`${date}T${time}`).toISOString() : null }
        : { creativeId, dueOn: date || null },
      { onSuccess: onClose },
    );
  }

  return (
    <div
      ref={ref}
      className="colpop on datepop"
      role="dialog"
      aria-label={`${name}'s ${scheduled ? "Publish Date" : "Live Date"}`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") save();
      }}
    >
      <div className="datepop-b">
        <label className="datepop-f">
          <span>{scheduled ? "Publish Date" : "Live Date"}</span>
          <DateField value={date} onChange={setDate} autoOpen={!scheduled || focus === "date"} />
        </label>
        {scheduled && (
          <label className="datepop-f">
            <span>Time</span>
            <TimeField value={time} onChange={setTime} autoOpen={focus === "time"} />
          </label>
        )}
      </div>
      {reschedule.error && <p className="autherr">{errorMessage(reschedule.error, "Couldn't change the date")}</p>}
      <div className="datepop-acts">
        <button type="button" className="btn sm" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="btn sm primary" disabled={!ready || reschedule.isPending} onClick={save}>
          {reschedule.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
