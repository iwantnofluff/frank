"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { CreativeListRow } from "@/hooks/use-creatives";
import { bandOf, stageColor, type Band } from "@/lib/stage-labels";
import { getMonthGridDays, dateKey } from "@/lib/calendar-weeks";
import { CreativePreviewPopover } from "@/components/project/CreativePreviewPopover";

const DAY_ABBR = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_PER_CELL = 3;

function timeOf(dt: Date) {
  return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

// Ports frank-prototype.html's "Calendar" mode (renderCal()'s calendar
// branch) — a real month grid, not the Month-mode table. "+N more"
// expands the cell in place rather than the prototype's floating
// #daypop, a small simplification.
export function ProjectCalendarGrid({
  year,
  month,
  creatives,
  statusFilter,
}: {
  year: number;
  month: number;
  creatives: CreativeListRow[];
  statusFilter: "all" | Band;
}) {
  const router = useRouter();
  const today = useMemo(() => new Date(), []);
  const todayKey = dateKey(today);

  const byDay = useMemo(() => {
    const map = new Map<string, { c: CreativeListRow; dt: Date }[]>();
    for (const c of creatives) {
      if (!c.scheduled_at) continue;
      if (statusFilter !== "all" && bandOf(c.stage, c.exception) !== statusFilter) continue;
      const dt = new Date(c.scheduled_at);
      const key = dateKey(dt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ c, dt });
    }
    for (const list of map.values()) list.sort((a, b) => a.dt.getTime() - b.dt.getTime());
    return map;
  }, [creatives, statusFilter]);

  const days = useMemo(() => getMonthGridDays(year, month), [year, month]);

  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<{ creative: CreativeListRow; rect: DOMRect } | null>(null);
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleEnter(creative: CreativeListRow, target: HTMLElement) {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    const rect = target.getBoundingClientRect();
    hoverTimeout.current = setTimeout(() => setHover({ creative, rect }), 200);
  }
  // Delayed, and cancellable by the popover's own mouseenter (see the
  // <CreativePreviewPopover> below) — same "hold while hovered" fix as
  // ProjectCalendarTable's identical pair.
  function scheduleHide() {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setHover(null), 200);
  }
  function cancelHide() {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
  }

  return (
    <>
      <div className="calhead">
        {DAY_ABBR.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="calgrid">
        {days.map((dt) => {
          const key = dateKey(dt);
          const items = byDay.get(key) ?? [];
          const out = dt.getMonth() !== month;
          const isToday = key === todayKey;
          const weekend = [5, 6].includes((dt.getDay() + 6) % 7);
          const expanded = expandedDays.has(key);
          const shown = expanded ? items : items.slice(0, MAX_PER_CELL);
          return (
            <div
              key={key}
              className={`cell${out ? " out" : ""}${isToday ? " today" : ""}${weekend && !out ? " wknd" : ""}`}
            >
              <span className="dnum">{dt.getDate()}</span>
              {shown.map(({ c, dt: itemDt }) => {
                const color = stageColor(c.stage, c.exception);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className="ev"
                    onMouseEnter={(e) => handleEnter(c, e.currentTarget)}
                    onMouseLeave={scheduleHide}
                    onClick={() => router.push(`/creatives/${c.id}`)}
                  >
                    <span className="bar4" style={{ background: color }} />
                    <span className="ebody">
                      <span className="et">{c.name}</span>
                      <span className="erow">
                        <span className="etm">{timeOf(itemDt)}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
              {items.length > MAX_PER_CELL && !expanded && (
                <button
                  type="button"
                  className="more"
                  onClick={() => setExpandedDays((prev) => new Set(prev).add(key))}
                >
                  +{items.length - MAX_PER_CELL} more
                </button>
              )}
            </div>
          );
        })}
      </div>
      {hover && (
        <CreativePreviewPopover
          creative={hover.creative}
          anchorRect={hover.rect}
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
        />
      )}
    </>
  );
}
