import type { ReactNode } from "react";
import { aspectRatioCss } from "@/lib/formats";

// Stands in for the image inside the post preview (.ig-media) when a post
// has copy but no artwork yet, so it still reads, and can be commented on,
// as a post. The same message as the page's own empty state (.awaiting),
// sized to the main format's shape where it has one.
export function NoArtwork({ format, note, children }: { format: string; note?: string; children?: ReactNode }) {
  return (
    <div className="awaiting ig-noart" style={{ aspectRatio: aspectRatioCss(format) }}>
      <svg viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 15l5-5 4 4 3-3 6 6" />
        <circle cx="9" cy="9" r="1.4" />
      </svg>
      <b>No artwork yet</b>
      {note && <span>{note}</span>}
      {children}
    </div>
  );
}
