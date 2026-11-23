"use client";

import { createContext, useContext } from "react";
import { safeZones, type SafeZoneKind } from "@/lib/safe-zones";

// Which zones are on, for a video player inside the post (VideoPlayer): it
// draws them in its own frame, so they go wherever the video goes, the
// expanded player included (reported directly: expanded, they were left
// behind). null: off.
export const SafeZoneContext = createContext<SafeZoneKind | null>(null);

// The zones inside a video's frame, when they're on.
export function VideoSafeZones() {
  const kind = useContext(SafeZoneContext);
  return kind ? <SafeZoneOverlay kind={kind} /> : null;
}

// Safe Zones over a vertical video or story (direct instruction): the
// areas the platform covers with its own buttons and words, shaded and
// named, and the clear area for text outlined. Laid over the artwork and
// never in the way: the video plays and scrubs under it.
export function SafeZoneOverlay({ kind }: { kind: SafeZoneKind }) {
  const { covered, safe } = safeZones(kind);
  const box = (a: { top: number; left: number; width: number; height: number }) => ({
    top: `${a.top}%`,
    left: `${a.left}%`,
    width: `${a.width}%`,
    height: `${a.height}%`,
  });
  return (
    <div className="safezones" aria-hidden="true" data-kind={kind}>
      {covered.map((a) => (
        <div key={a.label} className="safezone-covered" style={box(a)}>
          <span>{a.label}</span>
        </div>
      ))}
      <div className="safezone-safe" style={box(safe)} />
    </div>
  );
}
