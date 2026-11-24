// Where the platforms lay their own buttons and words over a post (direct
// instruction: check text placement through a video), as percentages of
// its frame. No platform publishes them for organic posts; these follow
// the Instagram guide the user gave (24 Nov 2026):
// - Reels, 1080×1920: 220px clear at the top, 35px at each side, 450px at
//   the foot, and the buttons' column, 100px plus the side's 35px, cut out
//   of the lower right from about 60% down (shown, not measured), so the
//   safe area is an L. A Reel's crop in the feed: its middle 1080×1440.
// - Stories: 250px top and foot, with good zones inside them (drawn, not
//   measured: estimated).
// - Meta Stories / Reels ads: 220px top, 450px foot, full width.
// - Posts, 3:4 (1080×1440): 50px sides, 180px top and foot.
// - Carousels: 120px down the right, for the count and the buttons.
// YouTube Shorts keep the usual 288 / 672 / 48 / 192 px, edge to edge.
// Approximate: a real phone is the last word. docs/parity-gaps.md.

export type SafeZoneKind = "reel" | "reelAd" | "story" | "short" | "post" | "carousel" | "feedCrop";

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
  // Fine for text, not the best (a Story's "good zones"): shaded lighter.
  good?: CoveredArea[];
  // The area clear of all of them, for text, as its outline's corners
  // ([x, y] in % of the frame), clockwise from the top left: a box, or a
  // Reel's L around its buttons.
  safe: [number, number][];
}

// A box's corners, for the kinds whose safe area is one.
function box(top: number, left: number, width: number, height: number): [number, number][] {
  return [
    [left, top],
    [left + width, top],
    [left + width, top + height],
    [left, top + height],
  ];
}

// The Reel guide's figures, as % of 1080×1920.
const REEL_TOP = (220 / 1920) * 100;
const REEL_SIDE = (35 / 1080) * 100;
const REEL_FOOT = 100 - (450 / 1920) * 100;
const REEL_BUTTONS_LEFT = 100 - (135 / 1080) * 100;
const REEL_BUTTONS_TOP = 60;
// A Story's: 250px top and bottom no-go; the good zones inside them, about
// 280px at the top and 240px at the foot (drawn, not labelled, in the
// guide: estimated from it).
const STORY_EDGE = (250 / 1920) * 100;
const STORY_GOOD_TOP = (530 / 1920) * 100;
const STORY_GOOD_FOOT = (1430 / 1920) * 100;
// A Meta Stories / Reels ad: 220px top, 450px foot, full width.
const AD_TOP = (220 / 1920) * 100;
const AD_FOOT = 100 - (450 / 1920) * 100;
// A post, 3:4 (1080×1440): 50px sides, 180px top and foot.
const POST_SIDE = (50 / 1080) * 100;
const POST_EDGE = (180 / 1440) * 100;
// A carousel: 120px down the right, for the count and the buttons.
const CAROUSEL_RIGHT = 100 - (120 / 1080) * 100;
// A Reel in the feed: the middle 1080×1440 of its 1080×1920.
const FEED_CROP = (240 / 1920) * 100;

const ZONES: Record<SafeZoneKind, SafeZones> = {
  reel: {
    covered: [
      { top: 0, left: 0, width: 100, height: REEL_TOP, label: "Back and create" },
      { top: REEL_BUTTONS_TOP, left: REEL_BUTTONS_LEFT, width: 100 - REEL_BUTTONS_LEFT, height: REEL_FOOT - REEL_BUTTONS_TOP, label: "Buttons" },
      { top: REEL_FOOT, left: 0, width: 100, height: 100 - REEL_FOOT, label: "Name and caption" },
    ],
    safe: [
      [REEL_SIDE, REEL_TOP],
      [100 - REEL_SIDE, REEL_TOP],
      [100 - REEL_SIDE, REEL_BUTTONS_TOP],
      [REEL_BUTTONS_LEFT, REEL_BUTTONS_TOP],
      [REEL_BUTTONS_LEFT, REEL_FOOT],
      [REEL_SIDE, REEL_FOOT],
    ],
  },
  reelAd: {
    covered: [
      { top: 0, left: 0, width: 100, height: AD_TOP, label: "No-go zone" },
      { top: AD_FOOT, left: 0, width: 100, height: 100 - AD_FOOT, label: "No-go zone" },
    ],
    safe: box(AD_TOP, 0, 100, AD_FOOT - AD_TOP),
  },
  story: {
    covered: [
      { top: 0, left: 0, width: 100, height: STORY_EDGE, label: "Account and progress" },
      { top: 100 - STORY_EDGE, left: 0, width: 100, height: STORY_EDGE, label: "Reply bar" },
    ],
    good: [
      { top: STORY_EDGE, left: 0, width: 100, height: STORY_GOOD_TOP - STORY_EDGE, label: "Good zone" },
      { top: STORY_GOOD_FOOT, left: 0, width: 100, height: 100 - STORY_EDGE - STORY_GOOD_FOOT, label: "Good zone" },
    ],
    safe: box(STORY_GOOD_TOP, 0, 100, STORY_GOOD_FOOT - STORY_GOOD_TOP),
  },
  short: {
    covered: [
      { top: 0, left: 0, width: 100, height: 15, label: "Search and menu" },
      { top: 15, left: 82.2, width: 17.8, height: 50, label: "Buttons" },
      { top: 65, left: 0, width: 100, height: 35, label: "Channel, title and audio" },
    ],
    safe: box(15, 0, 82.2, 50),
  },
  post: {
    covered: [
      { top: 0, left: 0, width: 100, height: POST_EDGE, label: "Margin" },
      { top: POST_EDGE, left: 0, width: POST_SIDE, height: 100 - 2 * POST_EDGE, label: "" },
      { top: POST_EDGE, left: 100 - POST_SIDE, width: POST_SIDE, height: 100 - 2 * POST_EDGE, label: "" },
      { top: 100 - POST_EDGE, left: 0, width: 100, height: POST_EDGE, label: "Margin" },
    ],
    safe: box(POST_EDGE, POST_SIDE, 100 - 2 * POST_SIDE, 100 - 2 * POST_EDGE),
  },
  carousel: {
    covered: [{ top: 0, left: CAROUSEL_RIGHT, width: 100 - CAROUSEL_RIGHT, height: 100, label: "Count and buttons" }],
    safe: box(0, 0, CAROUSEL_RIGHT, 100),
  },
  feedCrop: {
    covered: [
      { top: 0, left: 0, width: 100, height: FEED_CROP, label: "Cropped in the feed" },
      { top: 100 - FEED_CROP, left: 0, width: 100, height: FEED_CROP, label: "Cropped in the feed" },
    ],
    safe: box(FEED_CROP, 0, 100, 100 - 2 * FEED_CROP),
  },
};

const KIND: Record<string, SafeZoneKind> = {
  ig_reel: "reel",
  // A paid Stories / Reels placement: the guide's no-go zones.
  meta_story: "reelAd",
  ig_feed: "post",
  ig_carousel: "carousel",
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
