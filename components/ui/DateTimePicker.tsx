"use client";

import { useEffect, useRef, useState } from "react";
import { useViewportFit } from "@/hooks/use-viewport-fit";
import { getMonthGridDays, dateKey } from "@/lib/calendar-weeks";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_ABBR = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function parseDateValue(value: string): Date {
  if (value) {
    const [y, m, d] = value.split("-").map(Number);
    if (y && m && d) return new Date(y, m - 1, d);
  }
  return new Date();
}

// Ported to match the reference calendar picker's own layout (Today, a
// combined date+time row, prev/next month, a click-to-pick day grid)
// rather than relying on the browser's own native date-input popup,
// which looks different per browser/OS. Renders as a calendar-icon button
// that opens this popover — the caller's own native <input type="date">/
// <input type="time"> stay exactly where they are (same ids, same direct
// fill-ability for every existing e2e spec); this is purely an additional
// way to set the same two values, not a replacement for them.
export function DateTimePicker({
  date,
  time,
  onChangeDate,
  onChangeTime,
}: {
  date: string;
  time: string;
  onChangeDate: (value: string) => void;
  onChangeTime: (value: string) => void;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  useViewportFit(popRef, anchor, { side: "below", align: "end", gap: 4 });

  const viewBase = parseDateValue(date);
  const [viewYear, setViewYear] = useState(viewBase.getFullYear());
  const [viewMonth, setViewMonth] = useState(viewBase.getMonth());

  useEffect(() => {
    if (!anchor) return;
    function onMouseDown(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setAnchor(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setAnchor(null);
    }
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [anchor]);

  function open() {
    const base = parseDateValue(date);
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    setAnchor(triggerRef.current!.getBoundingClientRect());
  }

  const days = getMonthGridDays(viewYear, viewMonth);
  const selectedKey = date || null;
  const todayKey = dateKey(new Date());

  function goPrevMonth() {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  }
  function goNextMonth() {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  return (
    <>
      <button type="button" ref={triggerRef} className="tool dtp-icon" title="Pick a date" onClick={open}>
        <svg viewBox="0 0 24 24">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      </button>
      {anchor && (
        <div className="colpop on dtp-pop" ref={popRef}>
          <div className="dtp-row">
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                const t = new Date();
                onChangeDate(dateKey(t));
                setViewYear(t.getFullYear());
                setViewMonth(t.getMonth());
              }}
            >
              Today
            </button>
            <input
              aria-label="Date"
              type="date"
              className="bin one dtp-input"
              value={date}
              onChange={(e) => {
                onChangeDate(e.target.value);
                const d = parseDateValue(e.target.value);
                setViewYear(d.getFullYear());
                setViewMonth(d.getMonth());
              }}
            />
            <input
              aria-label="Time"
              type="time"
              className="bin one dtp-input"
              value={time}
              onChange={(e) => onChangeTime(e.target.value)}
            />
          </div>

          <div className="dtp-nav">
            <select value={viewMonth} onChange={(e) => setViewMonth(Number(e.target.value))}>
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i}>
                  {m}
                </option>
              ))}
            </select>
            <select value={viewYear} onChange={(e) => setViewYear(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => viewYear - 6 + i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <div className="dtp-nav-arrows">
              <button type="button" onClick={goPrevMonth} title="Previous month">
                <svg viewBox="0 0 24 24">
                  <path d="M15 6l-6 6 6 6" />
                </svg>
              </button>
              <button type="button" onClick={goNextMonth} title="Next month">
                <svg viewBox="0 0 24 24">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          </div>

          <div className="dtp-grid">
            {DAY_ABBR.map((d) => (
              <div key={d} className="dtp-dow">
                {d}
              </div>
            ))}
            {days.map((d) => {
              const key = dateKey(d);
              const inMonth = d.getMonth() === viewMonth;
              return (
                <button
                  key={key}
                  type="button"
                  className={`dtp-day${key === selectedKey ? " selected" : ""}${key === todayKey ? " today" : ""}${inMonth ? "" : " out"}`}
                  onClick={() => {
                    onChangeDate(key);
                    setAnchor(null);
                  }}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
