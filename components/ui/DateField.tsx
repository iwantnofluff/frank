"use client";

import { useEffect, useLayoutEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useViewportFit } from "@/hooks/use-viewport-fit";

// A date or time field with Frank's own dropdown in place of the browser's
// (direct instruction: the dropdown in the app's font, which the browser's
// own can't be given). Laid out as the browser's is: the month with arrows,
// the day grid, Clear and Today; or hour and minute columns. The field
// itself is still the browser's, so a date or time can be typed straight in.
//
// The dropdown sits on the page's top layer (a portal), so a window or a
// popover's own clipping and motion can't move it; anything closing on an
// outside click leaves clicks inside `.caldrop` alone.

type Common = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  // Opens as soon as it appears (the table's date popover, on the one
  // clicked).
  autoOpen?: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

function useDrop(autoOpen: boolean | undefined) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const drop = useRef<HTMLDivElement>(null);
  const open = () => {
    if (input.current) setAnchor(input.current.getBoundingClientRect());
  };
  const close = () => setAnchor(null);

  // Measured a frame later, once whatever holds the field has moved into
  // place: the table's date popover positions itself after its fields
  // appear, and flips above its row near the foot of the window, so a
  // measurement straight away found the field where the popover started
  // (reported directly: the calendar opened at the top of the page).
  useEffect(() => {
    if (!autoOpen) return;
    input.current?.focus();
    const frame = requestAnimationFrame(open);
    return () => cancelAnimationFrame(frame);
  }, [autoOpen]);

  useEffect(() => {
    if (!anchor) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (drop.current?.contains(t) || input.current?.contains(t)) return;
      setAnchor(null);
    }
    // Escape closes only the dropdown, not the popover or window under it.
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setAnchor(null);
      } else if (e.key === "Tab") setAnchor(null);
    }
    // A window scrolling under it (as one does to bring the field into
    // view) carries it along with the field.
    function onScroll(e: Event) {
      if (drop.current?.contains(e.target as Node) || !input.current) return;
      setAnchor(input.current.getBoundingClientRect());
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [anchor]);

  // The browser's own picker kept shut: clicking the field opens Frank's.
  const inputProps = {
    ref: input,
    onClick: (e: React.MouseEvent<HTMLInputElement>) => {
      e.preventDefault();
      open();
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowDown" && e.altKey) open();
    },
    // Moving on to another field closes it (the dropdown itself never
    // takes focus).
    onBlur: close,
  };
  return { anchor, drop, inputProps, close };
}

function Drop({
  anchor,
  dropRef,
  className,
  children,
}: {
  anchor: DOMRect;
  dropRef: React.RefObject<HTMLDivElement | null>;
  className: string;
  children: ReactNode;
}) {
  useViewportFit(dropRef, anchor, { side: "below", gap: 4, align: "start" });
  return createPortal(
    <div
      ref={dropRef}
      className={`caldrop ${className}`}
      // Its clicks and keys stay its own (a popover saving on Enter, a
      // window closing on a click).
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}

export function DateField({ value, onChange, autoOpen, className, ...rest }: Common) {
  const { anchor, drop, inputProps, close } = useDrop(autoOpen);
  return (
    <>
      <input
        {...rest}
        {...inputProps}
        type="date"
        className={`${className ?? ""} pickfield`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          inputProps.onKeyDown(e);
          rest.onKeyDown?.(e);
        }}
      />
      {anchor && (
        <Drop anchor={anchor} dropRef={drop} className="caldate">
          <Calendar
            value={value}
            onPick={(v) => {
              onChange(v);
              close();
            }}
          />
        </Drop>
      )}
    </>
  );
}

function Calendar({ value, onPick }: { value: string; onPick: (v: string) => void }) {
  const today = ymd(new Date());
  const start = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : today;
  const [shown, setShown] = useState({ y: +start.slice(0, 4), m: +start.slice(5, 7) - 1 });
  const [months, setMonths] = useState(false);
  const step = (n: number) =>
    setShown(({ y, m }) => (months ? { y: y + n, m } : { y: y + Math.floor((m + n) / 12), m: (((m + n) % 12) + 12) % 12 }));

  const first = new Date(shown.y, shown.m, 1);
  const cells = Array.from({ length: 42 }, (_, i) => new Date(shown.y, shown.m, 1 - first.getDay() + i));
  // Five rows when the month fits in them, as the browser's does.
  const rows = cells[35].getMonth() === shown.m ? 6 : 5;

  return (
    <>
      <div className="cal-h">
        <button type="button" className="cal-title" aria-expanded={months} onClick={() => setMonths(!months)}>
          {MONTHS[shown.m]} {shown.y}
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        <span className="cal-arrows">
          <button type="button" aria-label={months ? "Previous year" : "Previous month"} onClick={() => step(-1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m18 15-6-6-6 6" />
            </svg>
          </button>
          <button type="button" aria-label={months ? "Next year" : "Next month"} onClick={() => step(1)}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </span>
      </div>
      {months ? (
        <div className="cal-months">
          {MONTHS.map((name, m) => (
            <button
              key={name}
              type="button"
              aria-pressed={m === shown.m}
              onClick={() => {
                setShown(({ y }) => ({ y, m }));
                setMonths(false);
              }}
            >
              {name.slice(0, 3)}
            </button>
          ))}
        </div>
      ) : (
        <div className="cal-grid" role="grid">
          {DAYS.map((d, i) => (
            <span key={i} className="cal-dow">
              {d}
            </span>
          ))}
          {cells.slice(0, rows * 7).map((d) => {
            const v = ymd(d);
            return (
              <button
                key={v}
                type="button"
                className={`cal-day${d.getMonth() !== shown.m ? " out" : ""}${v === today ? " today" : ""}`}
                aria-pressed={v === value}
                aria-label={d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                onClick={() => onPick(v)}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
      )}
      <div className="cal-f">
        <button type="button" onClick={() => onPick("")}>
          Clear
        </button>
        <button type="button" onClick={() => onPick(today)}>
          Today
        </button>
      </div>
    </>
  );
}

// Twelve-hour or 24-hour, as the field itself shows the time.
function uses12h() {
  const cycle = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hourCycle;
  return cycle === "h12" || cycle === "h11";
}

export function TimeField({ value, onChange, autoOpen, className, ...rest }: Common) {
  const { anchor, drop, inputProps, close } = useDrop(autoOpen);
  return (
    <>
      <input
        {...rest}
        {...inputProps}
        type="time"
        className={`${className ?? ""} pickfield`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          inputProps.onKeyDown(e);
          rest.onKeyDown?.(e);
        }}
      />
      {anchor && (
        <Drop anchor={anchor} dropRef={drop} className="caltime">
          <Clock value={value} onChange={onChange} onDone={close} />
        </Drop>
      )}
    </>
  );
}

function Clock({ value, onChange, onDone }: { value: string; onChange: (v: string) => void; onDone: () => void }) {
  const twelve = uses12h();
  const [h, m] = /^\d{2}:\d{2}/.test(value) ? [+value.slice(0, 2), +value.slice(3, 5)] : [null, null];
  const set = (hour: number, minute: number) => onChange(`${pad(hour)}:${pad(minute)}`);
  const hours = twelve ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : Array.from({ length: 24 }, (_, i) => i);
  const pm = h !== null && h >= 12;
  const colRef = useRef<HTMLDivElement>(null);

  // The chosen hour and minute scrolled to the top of their columns.
  useLayoutEffect(() => {
    colRef.current?.querySelectorAll<HTMLElement>(".cal-col").forEach((col) => {
      const on = col.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (on) col.scrollTop = on.offsetTop - col.offsetTop;
    });
    // On opening only.
  }, []);

  return (
    <div className="cal-cols" ref={colRef}>
      <div className="cal-col" aria-label="Hour">
        {hours.map((hr) => {
          const actual = twelve ? (hr % 12) + (pm ? 12 : 0) : hr;
          return (
            <button key={hr} type="button" aria-pressed={h === actual} onClick={() => set(actual, m ?? 0)}>
              {twelve ? hr : pad(hr)}
            </button>
          );
        })}
      </div>
      <div className="cal-col" aria-label="Minute">
        {Array.from({ length: 60 }, (_, i) => i).map((mi) => (
          <button
            key={mi}
            type="button"
            aria-pressed={m === mi}
            onClick={() => {
              set(h ?? 9, mi);
              onDone();
            }}
          >
            {pad(mi)}
          </button>
        ))}
      </div>
      {twelve && (
        <div className="cal-col" aria-label="AM or PM">
          {(["AM", "PM"] as const).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={h !== null && (p === "PM") === pm}
              onClick={() => set(((h ?? 9) % 12) + (p === "PM" ? 12 : 0), m ?? 0)}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
