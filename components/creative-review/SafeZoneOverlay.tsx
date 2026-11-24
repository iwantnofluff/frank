"use client";

import { createContext, useContext } from "react";
import { safeZones, type SafeZoneKind } from "@/lib/safe-zones";

// Which zones are on, for a video player inside the post (VideoPlayer): it
// draws them in its own frame, so they go wherever the video goes, the
// expanded player included (reported directly: expanded, they were left
// behind). Empty: off.
// Which are on: the format's Safe Zones, a Reel's Feed Crop, or both.
export const SafeZoneContext = createContext<SafeZoneKind[]>([]);

// The zones inside a video's frame, when they're on.
export function VideoSafeZones() {
  const kinds = useContext(SafeZoneContext);
  return (
    <>
      {kinds.map((k) => (
        <SafeZoneOverlay key={k} kind={k} />
      ))}
    </>
  );
}

// Safe Zones over a vertical video or story (direct instruction): the
// areas the platform covers with its own buttons and words, shaded and
// named, and the clear area for text outlined. Laid over the artwork and
// never in the way: the video plays and scrubs under it.
export function SafeZoneOverlay({ kind }: { kind: SafeZoneKind }) {
  const { covered, good = [], safe } = safeZones(kind);
  const area = (a: { top: number; left: number; width: number; height: number }) => ({
    top: `${a.top}%`,
    left: `${a.left}%`,
    width: `${a.width}%`,
    height: `${a.height}%`,
  });
  return (
    <div className="safezones" aria-hidden="true" data-kind={kind}>
      {covered.map((a, i) => (
        <div key={i} className="safezone-covered" style={area(a)}>
          {a.label && <span>{a.label}</span>}
        </div>
      ))}
      {/* Fine for text, not the best: lighter. */}
      {good.map((a, i) => (
        <div key={`g${i}`} className="safezone-good" style={area(a)}>
          <span>{a.label}</span>
        </div>
      ))}
      {/* The clear area's outline, a box or a Reel's L round its buttons,
          stretched to the frame; its dashes stay the same width. */}
      <svg className="safezone-safe" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polygon className="safezone-safe-shade" points={safe.map((p) => p.join(",")).join(" ")} />
        <polygon points={safe.map((p) => p.join(",")).join(" ")} />
      </svg>
    </div>
  );
}
