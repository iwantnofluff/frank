import type { ReactNode } from "react";
import { aspectRatioCss, type FormatSizes } from "@/lib/formats";

// Stands in for the image inside the post preview (.ig-media) when a post
// has copy but no artwork yet, so it still reads, and can be commented on,
// as a post. The same message as the page's own empty state (.awaiting),
// sized to the main format's shape (its chosen size, phase139) where it
// has one.
export function NoArtwork({
  format,
  sizes,
  top,
  title = "No artwork yet",
  note,
  children,
}: {
  format: string | null;
  sizes?: FormatSizes | null;
  // What goes in the artwork's place from the top (its Text on Image,
  // direct instruction), with its button under it, and no picture, title
  // or note.
  top?: ReactNode;
  // "Artwork removed", once it has gone after the post went live (phase60).
  title?: string;
  note?: string;
  children?: ReactNode;
}) {
  if (top) {
    return (
      <div className="awaiting ig-noart has-top" style={{ aspectRatio: aspectRatioCss(format, sizes) }}>
        {/* Its button on the left, just under the words, as in the
            table; no picture (direct instruction). */}
        <div className="noart-top">
          {top}
          {children && <div className="noart-act">{children}</div>}
        </div>
      </div>
    );
  }
  return (
    <div className="awaiting ig-noart" style={{ aspectRatio: aspectRatioCss(format, sizes) }}>
      <svg viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 15l5-5 4 4 3-3 6 6" />
        <circle cx="9" cy="9" r="1.4" />
      </svg>
      <b>{title}</b>
      {note && <span>{note}</span>}
      {children}
    </div>
  );
}
