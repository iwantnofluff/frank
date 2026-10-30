"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface PillMenuItem {
  key: string;
  text: string;
  // A status under its stage, set in a little.
  indent?: boolean;
}

// A pill that opens a list below it (direct instruction: from the bottom
// of the pill, not over it, as a native dropdown on a Mac does). Arrow
// keys move through it, Enter picks, Escape or a click elsewhere closes
// it. Drawn on the page itself, so a table's scrolling box can't clip it.
export function PillMenu({
  label,
  children,
  items,
  value,
  onPick,
  disabled,
  className,
  style,
}: {
  label: string;
  children: ReactNode;
  items: PillMenuItem[];
  value: string;
  onPick: (key: string) => void;
  disabled?: boolean;
  className: string;
  style?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<{ left: number; top: number; minWidth: number; maxHeight: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();

  const close = (focusBack = true) => {
    setOpen(false);
    if (focusBack) button.current?.focus();
  };

  // Placed under the pill, as far down as there's room for.
  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const r = button.current.getBoundingClientRect();
    setPlace({ left: r.left, top: r.bottom + 4, minWidth: r.width, maxHeight: Math.max(160, window.innerHeight - r.bottom - 16) });
  }, [open]);

  // Kept on the screen, as on a phone: a pill near the right edge opens its
  // list leftwards as far as it needs, and one near the bottom opens it
  // above when there's more room there.
  useLayoutEffect(() => {
    if (!place || !list.current || !button.current) return;
    const l = list.current.getBoundingClientRect();
    const r = button.current.getBoundingClientRect();
    const over = l.right - (window.innerWidth - 8);
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    const up = l.bottom > window.innerHeight - 8 && above > below && place.top > r.top;
    if (over > 0.5 || up) {
      setPlace((p) =>
        p && {
          ...p,
          left: over > 0.5 ? Math.max(8, p.left - over) : p.left,
          ...(up ? { top: r.top - 4 - Math.min(list.current!.scrollHeight + 2, above), maxHeight: above } : {}),
        },
      );
    }
  }, [place]);

  // The list takes the keys once it's drawn.
  useEffect(() => {
    if (open && place) list.current?.focus();
  }, [open, place]);

  // Closed by a click elsewhere, or the page scrolling under it.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!list.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) close(false);
    };
    const moved = (e: Event) => {
      if (!list.current?.contains(e.target as Node)) close(false);
    };
    // Escape closes it wherever the focus is.
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("scroll", moved, true);
    window.addEventListener("resize", moved);
    return () => {
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("mousedown", away);
      window.removeEventListener("scroll", moved, true);
      window.removeEventListener("resize", moved);
    };
  }, [open]);

  // The one picked in view as it opens.
  useEffect(() => {
    if (open) list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const pick = (i: number) => {
    close();
    if (items[i] && items[i].key !== value) onPick(items[i].key);
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        className={className}
        style={style}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setActive(Math.max(0, items.findIndex((it) => it.key === value)));
          setOpen((o) => !o);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            setActive(Math.max(0, items.findIndex((it) => it.key === value)));
            setOpen(true);
          }
        }}
      >
        {children}
      </button>
      {open &&
        place &&
        createPortal(
          <ul
            ref={list}
            id={id}
            role="listbox"
            aria-label={label}
            aria-activedescendant={`${id}-${active}`}
            tabIndex={-1}
            className="pillmenu"
            style={{ left: place.left, top: place.top, minWidth: place.minWidth, maxHeight: place.maxHeight }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(items.length - 1, a + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === "Home") {
                e.preventDefault();
                setActive(0);
              } else if (e.key === "End") {
                e.preventDefault();
                setActive(items.length - 1);
              } else if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                pick(active);
              } else if (e.key === "Escape") {
                // Closes the list only, not a window it sits in.
                e.preventDefault();
                e.stopPropagation();
                close();
              } else if (e.key === "Tab") {
                close(false);
              }
            }}
          >
            {items.map((it, i) => (
              <li
                key={it.key}
                id={`${id}-${i}`}
                data-i={i}
                role="option"
                aria-selected={it.key === value}
                className={`${it.indent ? "in" : ""}${i === active ? " on" : ""}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(i)}
              >
                {it.text}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}
