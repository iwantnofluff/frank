// Where the platforms lay their own buttons and words over a vertical
// video or story (direct instruction: check text placement through a
// video), as percentages of the 9:16 frame. None of these platforms
// publishes them for organic posts, so these are the figures most often
// given for 1080×1920: Meta's ad guidance for Reels (14% top, 35% bottom,
// 6% sides) and Stories (14% top and bottom), and YouTube Shorts' usual
// 288 / 672 / 48 / 192 px. Approximate: a real phone is the last word.
// docs/parity-gaps.md.

export type SafeZoneKind = "reel" | "story" | "short";

// One covered area: its edges in % of the frame, and what's there.
export interface CoveredArea {
  top: number;
  left: number;
  width: number;
  height: number;
  label: string;
}

export interface SafeZones {
  covered: CoveredArea[];
  // The area clear of all of them, for text.
  safe: { top: number; left: number; width: number; height: number };
}

const ZONES: Record<SafeZoneKind, SafeZones> = {
  reel: {
    covered: [
      { top: 0, left: 0, width: 100, height: 14, label: "Account and menu" },
      // The like, comment, share column, above the caption.
      { top: 40, left: 86, width: 14, height: 25, label: "Buttons" },
      { top: 65, left: 0, width: 100, height: 35, label: "Name, caption and audio" },
    ],
    safe: { top: 14, left: 6, width: 80, height: 51 },
  },
  story: {
    covered: [
      { top: 0, left: 0, width: 100, height: 14, label: "Account and progress" },
      { top: 86, left: 0, width: 100, height: 14, label: "Reply bar or call to action" },
    ],
    safe: { top: 14, left: 6, width: 88, height: 72 },
  },
  short: {
    covered: [
      { top: 0, left: 0, width: 100, height: 15, label: "Search and menu" },
      { top: 15, left: 82.2, width: 17.8, height: 50, label: "Buttons" },
      { top: 65, left: 0, width: 100, height: 35, label: "Channel, title and audio" },
    ],
    safe: { top: 15, left: 4.4, width: 77.8, height: 50 },
  },
};

const KIND: Record<string, SafeZoneKind> = {
  ig_reel: "reel",
  // A paid Stories / Reels placement: held to the Reels zones, the
  // tighter of the two.
  meta_story: "reel",
  ig_story: "story",
  fb_story: "story",
  wa_status: "story",
  yt_short: "short",
};

export function safeZoneKind(format: string | null | undefined): SafeZoneKind | null {
  return (format && KIND[format]) || null;
}

export function safeZones(kind: SafeZoneKind): SafeZones {
  return ZONES[kind];
}
