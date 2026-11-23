// Where the platforms lay their own buttons and words over a vertical
// video or story (direct instruction: check text placement through a
// video), as percentages of the 9:16 frame. No platform publishes them for
// organic posts. A Reel's are measured from Instagram on an iPhone
// (reported directly, 23 Nov 2026: Meta's ad figure of 35% at the foot was
// far too much for an organic Reel): the top bar about 12%, the buttons a
// 12% column from about halfway down, the name, caption and remix row the
// last 20%. A paid Stories / Reels placement keeps Meta's ad guidance (14%
// top, 35% bottom, 6% sides), its call to action taking the foot. Stories
// are Meta's 14% top and bottom; YouTube Shorts the usual 288 / 672 / 48 /
// 192 px. Approximate: a real phone is the last word. docs/parity-gaps.md.

export type SafeZoneKind = "reel" | "reelAd" | "story" | "short";

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
      { top: 0, left: 0, width: 100, height: 12, label: "Back and create" },
      // The like, comment, repost, send, save column, down to the foot.
      { top: 48, left: 88, width: 12, height: 52, label: "Buttons" },
      { top: 80, left: 0, width: 88, height: 20, label: "Name and caption" },
    ],
    safe: { top: 12, left: 4, width: 84, height: 68 },
  },
  reelAd: {
    covered: [
      { top: 0, left: 0, width: 100, height: 14, label: "Account and menu" },
      { top: 40, left: 86, width: 14, height: 25, label: "Buttons" },
      { top: 65, left: 0, width: 100, height: 35, label: "Name, caption and call to action" },
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
  // A paid Stories / Reels placement: Meta's ad guidance.
  meta_story: "reelAd",
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
