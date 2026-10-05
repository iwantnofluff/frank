// A project's picture (phase56): one of Frank's own emoticons, drawn for
// Frank on a 24-unit grid as outlines (a 9-unit face, eyes around y 10, a
// mouth around y 15), so they read in white on the project's colour. The
// row stores the name; a name not in this set shows the initials.

const FACE = "M3 12a9 9 0 1 0 18 0a9 9 0 1 0-18 0";

// Eyes
const DOTS = "M8.3 10a.7.7 0 1 0 1.4 0a.7.7 0 1 0-1.4 0M14.3 10a.7.7 0 1 0 1.4 0a.7.7 0 1 0-1.4 0";
const ROUND = "M7.6 10a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0M13.6 10a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0";
const ARCS = "M7.5 10.5q1.5-2 3 0M13.5 10.5q1.5-2 3 0";
const DOWN_ARCS = "M7.5 9.5q1.5 2 3 0M13.5 9.5q1.5 2 3 0";
const SHUT = "M7.5 10h3M13.5 10h3";
const WINK = "M8.3 10a.7.7 0 1 0 1.4 0a.7.7 0 1 0-1.4 0M13.5 10.5q1.5-2 3 0";
const CROSS = "M8 9l2 2M10 9l-2 2M14 9l2 2M16 9l-2 2";
const SIDE = "M9.5 10a.7.7 0 1 0 1.4 0a.7.7 0 1 0-1.4 0M15.3 10a.7.7 0 1 0 1.4 0a.7.7 0 1 0-1.4 0";
const SQUINT = "M7.5 8.8l2.8 1.2l-2.8 1.2M16.5 8.8l-2.8 1.2l2.8 1.2";
const HEARTS =
  "M9 11.6l-1.5-1.5a.9.9 0 0 1 1.5-1a.9.9 0 0 1 1.5 1zM15 11.6l-1.5-1.5a.9.9 0 0 1 1.5-1a.9.9 0 0 1 1.5 1z";
const STARS = "M9 8.4v3.2M7.4 10h3.2M15 8.4v3.2M13.4 10h3.2";
const SPIRAL = "M9 8.4a1.6 1.6 0 1 1-1.6 1.6M15 8.4a1.6 1.6 0 1 1-1.6 1.6";
const GLASSES = "M6.8 10a2 2 0 1 0 4 0a2 2 0 1 0-4 0M13.2 10a2 2 0 1 0 4 0a2 2 0 1 0-4 0M10.8 10h2.4";
const SHADES = "M6 8.8h5v1.6a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2zM13 8.8h5v1.6a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2zM11 9.4h2";
const ANGRY_BROWS = "M7.5 7.8l3 1.4M16.5 7.8l-3 1.4";
const WORRY_BROWS = "M7.5 8.6l3-1.2M16.5 8.6l-3-1.2";
const RAISED_BROW = "M13.5 7.4q1.5-1 3 0";

// Mouths
const SMILE = "M8.5 14.5q3.5 3 7 0";
const SMALL_SMILE = "M10 15q2 1.4 4 0";
const GRIN = "M8 14h8a4 4 0 0 1-8 0z";
const BIG_GRIN = "M7.5 13.6h9a4.5 4.5 0 0 1-9 0zM8.3 15.6h7.4";
const FLAT = "M9 15.5h6";
const FROWN = "M8.5 16.8q3.5-3 7 0";
const OH = "M10.7 15.6a1.3 1.6 0 1 0 2.6 0a1.3 1.6 0 1 0-2.6 0";
const BIG_OH = "M10 16a2 2.4 0 1 0 4 0a2 2.4 0 1 0-4 0";
const WAVY = "M8 15.5q1-1 2 0t2 0t2 0t2 0";
const SMIRK = "M10 15.6q3 1 5.4-1.6";
const TEETH = "M8 14h8v3H8zM8 15.5h8M10.7 14v3M13.3 14v3";
const KISS = "M11.4 13.8q1.6.7 0 1.4q1.6.7 0 1.4";
const ZIP = "M8 15.5h8M9.5 14.6v1.8M11.5 14.6v1.8M13.5 14.6v1.8";
const TONGUE = "M8.5 14.5q3.5 3 7 0M12.6 16.1v1.3a1.1 1.1 0 0 0 2.2 0v-1.9";
const SIDE_TONGUE = "M8.5 15h7M12 15v1.6a1.3 1.3 0 0 0 2.6 0V15";
const LOPSIDED = "M8.5 15.8l7-1.2";
const SAD_SMALL = "M10 16.2q2-1.4 4 0";

// Extras
const BLUSH = "M5.8 13.4l1.2-.7M7 14.1l1.2-.7M17 12.7l1.2.7M15.8 13.4l1.2.7";
const TEAR = "M16.5 12.2q-1 1.6 0 2.4q1-.8 0-2.4z";
const SWEAT = "M18.6 6.4q-1.1 1.7 0 2.6q1.1-.9 0-2.6z";
const ZZZ = "M15.5 3.2h2.2l-2.2 2.4h2.2M18.5 1.4h1.6l-1.6 1.8h1.6";
const HALO = "M7.5 1.9a4.5 1.2 0 1 0 9 0a4.5 1.2 0 1 0-9 0";
const HORNS = "M5.6 6.4L5 3l2.8 1.9M18.4 6.4L19 3l-2.8 1.9";
const STEAM = "M3.6 6.5l-1.4-1.4M4.6 4.6l-.6-1.8M20.4 6.5l1.4-1.4M19.4 4.6l.6-1.8";
const SPARKLE = "M19.5 2.5v3M18 4h3";
const BANDAGE = "M14.5 6.2l3.3 3.3M16.9 5.4l-1.6 4.9";
const MASK = "M7 13.2h10v2.4a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3zM7 14l-3.3-1.4M17 14l3.3-1.4M9 15h6M9 16.6h6";
const MONOCLE = "M13.2 10a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0-3.6 0";
// Confetti in the corners.
const PARTY = "M3 3.4l1.3 1.3M19.7 4.7L21 3.4M12 .8v1.2M1.4 9.5h1.3M21.3 9.5h1.3";

export interface ProjectIcon {
  id: string;
  label: string;
  paths: string[];
}

export const PROJECT_ICONS: ProjectIcon[] = [
  { id: "smile", label: "Smile", paths: [FACE, DOTS, SMILE] },
  { id: "grin", label: "Grin", paths: [FACE, DOTS, GRIN] },
  { id: "beam", label: "Beam", paths: [FACE, ARCS, GRIN] },
  { id: "laugh", label: "Laugh", paths: [FACE, SQUINT, BIG_GRIN] },
  { id: "joy", label: "Tears of joy", paths: [FACE, ARCS, BIG_GRIN, TEAR] },
  { id: "content", label: "Content", paths: [FACE, DOWN_ARCS, SMALL_SMILE] },
  { id: "blush", label: "Blush", paths: [FACE, ARCS, SMALL_SMILE, BLUSH] },
  { id: "wink", label: "Wink", paths: [FACE, WINK, SMILE] },
  { id: "cheeky", label: "Cheeky", paths: [FACE, WINK, TONGUE] },
  { id: "silly", label: "Silly", paths: [FACE, SQUINT, SIDE_TONGUE] },
  { id: "love", label: "In love", paths: [FACE, HEARTS, SMILE] },
  { id: "starstruck", label: "Star-struck", paths: [FACE, STARS, GRIN] },
  { id: "kiss", label: "Kiss", paths: [FACE, DOTS, KISS] },
  { id: "cool", label: "Cool", paths: [FACE, SHADES, SMIRK] },
  { id: "nerd", label: "Nerd", paths: [FACE, GLASSES, SMALL_SMILE] },
  { id: "fancy", label: "Fancy", paths: [FACE, DOTS, MONOCLE, SMIRK] },
  { id: "smirk", label: "Smirk", paths: [FACE, SIDE, SMIRK] },
  { id: "curious", label: "Curious", paths: [FACE, DOTS, RAISED_BROW, LOPSIDED] },
  { id: "thinking", label: "Thinking", paths: [FACE, SIDE, RAISED_BROW, FLAT] },
  { id: "neutral", label: "Neutral", paths: [FACE, DOTS, FLAT] },
  { id: "unamused", label: "Unamused", paths: [FACE, SIDE, LOPSIDED] },
  { id: "calm", label: "Calm", paths: [FACE, SHUT, SMALL_SMILE] },
  { id: "sleepy", label: "Sleepy", paths: [FACE, SHUT, OH, ZZZ] },
  { id: "angel", label: "Angel", paths: [FACE, DOWN_ARCS, SMILE, HALO] },
  { id: "devil", label: "Mischief", paths: [FACE, ANGRY_BROWS, DOTS, SMILE, HORNS] },
  { id: "surprised", label: "Surprised", paths: [FACE, ROUND, OH] },
  { id: "shocked", label: "Shocked", paths: [FACE, ROUND, WORRY_BROWS, BIG_OH] },
  { id: "dizzy", label: "Dizzy", paths: [FACE, SPIRAL, WAVY] },
  { id: "knocked-out", label: "Knocked out", paths: [FACE, CROSS, OH] },
  { id: "worried", label: "Worried", paths: [FACE, DOTS, WORRY_BROWS, SAD_SMALL] },
  { id: "nervous", label: "Nervous", paths: [FACE, DOTS, TEETH, SWEAT] },
  { id: "awkward", label: "Awkward", paths: [FACE, SIDE, WAVY, SWEAT] },
  { id: "sad", label: "Sad", paths: [FACE, DOTS, FROWN] },
  { id: "crying", label: "Crying", paths: [FACE, WORRY_BROWS, DOTS, FROWN, TEAR] },
  { id: "angry", label: "Angry", paths: [FACE, ANGRY_BROWS, DOTS, FROWN] },
  { id: "fuming", label: "Fuming", paths: [FACE, ANGRY_BROWS, DOTS, TEETH, STEAM] },
  { id: "hushed", label: "Hushed", paths: [FACE, DOTS, ZIP] },
  { id: "unwell", label: "Unwell", paths: [FACE, SHUT, WAVY, SWEAT] },
  { id: "hurt", label: "Bumped", paths: [FACE, CROSS, LOPSIDED, BANDAGE] },
  { id: "masked", label: "Masked", paths: [FACE, DOWN_ARCS, MASK] },
  { id: "sparkly", label: "Sparkly", paths: [FACE, STARS, SMALL_SMILE, SPARKLE] },
  { id: "party", label: "Party", paths: [FACE, ARCS, BIG_GRIN, PARTY] },
];

const BY_ID = new Map(PROJECT_ICONS.map((i) => [i.id, i]));

export const projectIcon = (id: string | null | undefined): ProjectIcon | null => (id ? (BY_ID.get(id) ?? null) : null);
