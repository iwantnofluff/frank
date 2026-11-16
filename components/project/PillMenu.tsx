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
  hover = false,
  pressed,
  onPress,
}: {
  label: string;
  children: ReactNode;
  items: PillMenuItem[];
  value: string;
  onPick: (key: string) => void;
  disabled?: boolean;
  className: string;
  style?: CSSProperties;
  // Opened by pointing at it as well as by a click (direct instruction:
  // the post page's stages), and closed shortly after the pointer leaves
  // both the pill and its list.
  hover?: boolean;
  // Shown as the current one (the post page's stage switch styles on it).
  pressed?: boolean;
  // A click does this instead of opening the list (the post page's other
  // stages move the post there, as before); pointing still opens it.
  onPress?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  // Opened by pointing: the list doesn't take the keys from the page.
  const byHover = useRef(false);
  const leaving = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stay = () => {
    if (leaving.current) clearTimeout(leaving.current);
    leaving.current = null;
  };
  const leave = () => {
    stay();
    leaving.current = setTimeout(() => {
      if (byHover.current) setOpen(false);
    }, 180);
  };
  useEffect(() => stay, []);
  // One pointed-open list at a time: moving along to the next pill closes
  // this one at once, not after the pause.
  useEffect(() => {
    if (!hover) return;
    const other = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== id && byHover.current) {
        stay();
        setOpen(false);
      }
    };
    window.addEventListener("pillmenu-hover", other);
    return () => window.removeEventListener("pillmenu-hover", other);
  }, [hover, id]);
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<{ left: number; top: number; minWidth: number; maxHeight: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);

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

  // The list takes the keys once it's drawn, unless pointed open; then
  // once clicked.
  const [takeKeys, setTakeKeys] = useState(0);
  useEffect(() => {
    if (open && place && !byHover.current) list.current?.focus();
  }, [open, place, takeKeys]);

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
        aria-pressed={pressed}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (onPress) {
            stay();
            setOpen(false);
            onPress();
            return;
          }
          setActive(Math.max(0, items.findIndex((it) => it.key === value)));
          // Already pointed open (or opening): a click keeps it, and gives
          // it the keys.
          if (hover && byHover.current) {
            byHover.current = false;
            stay();
            setOpen(true);
            setTakeKeys((n) => n + 1);
            return;
          }
          byHover.current = false;
          setOpen((o) => !o);
        }}
        onMouseEnter={
          hover && !disabled
            ? () => {
                stay();
                if (open) return;
                byHover.current = true;
                window.dispatchEvent(new CustomEvent("pillmenu-hover", { detail: id }));
                setActive(Math.max(0, items.findIndex((it) => it.key === value)));
                setOpen(true);
              }
            : undefined
        }
        onMouseLeave={hover ? leave : undefined}
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
            onMouseEnter={hover ? stay : undefined}
            onMouseLeave={hover ? leave : undefined}
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
