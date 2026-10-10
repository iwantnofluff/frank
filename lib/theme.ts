// The agency colour theme — ported from the prototype's THEME / PRESETS /
// applyTheme() (frank-prototype.html), keyed by the same names as the CSS
// tokens in app/globals.css.

export const THEME_KEYS = [
  "action",
  "rail",
  "canvas",
  "surface",
  "ink",
  "line",
  "private",
  "amber",
  "green",
  "rose",
  "hl",
] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];
export type Theme = Record<ThemeKey, string>;

export const DEFAULT_THEME: Theme = {
  action: "#007BFF",
  rail: "#003C61",
  canvas: "#EDF1F6",
  surface: "#FFFFFF",
  ink: "#14161A",
  line: "#E3E6EA",
  private: "#FF5590",
  amber: "#FF8A00",
  green: "#2BB65B",
  rose: "#FF0000",
  hl: "#FFFBF0",
};

// The prototype's built-in presets. Each only lists what it changes; applying
// one starts from DEFAULT_THEME, exactly as the prototype does.
export const BUILT_IN_PRESETS: Record<string, Partial<Theme>> = {
  "No Fluff": {
    action: "#007BFF",
    rail: "#003C61",
    canvas: "#EDF1F6",
    ink: "#14161A",
    amber: "#FF8A00",
    green: "#2BB65B",
    rose: "#FF0000",
    hl: "#FFFBF0",
  },
  // Five rails from "mobile-app-design-custom-colors-scheme" by David
  // Michael (Adobe Color), with buttons, page and text to suit (direct
  // instruction, 10 Oct 2026). The palette's teals are a shade darker as
  // buttons, so white words on them stay readable.
  Plum: { action: "#6D4FC2", rail: "#544374", canvas: "#F3F1F7", ink: "#1D1828" },
  Dusk: { action: "#3F6AE0", rail: "#485274", canvas: "#EFF1F6", ink: "#181C2A" },
  Paper: { action: "#1F7A82", rail: "#FDFDFE", canvas: "#F2F4F6", ink: "#13232A" },
  Harbour: { action: "#1B7F89", rail: "#144B5C", canvas: "#EEF4F5", ink: "#10242B" },
  Lagoon: { action: "#144B5C", rail: "#22848D", canvas: "#EDF5F5", ink: "#0F2A30" },
};

export const HEX = /^#[0-9A-Fa-f]{6}$/;

// Whatever is stored, as a complete theme. The original column default wrote
// "highlight" (not the prototype's "hl") and had no "private"; anything
// missing or malformed falls back to the default.
export function normaliseTheme(stored: Record<string, unknown> | null | undefined): Theme {
  const src = { ...(stored ?? {}) } as Record<string, unknown>;
  if (src.hl === undefined && typeof src.highlight === "string") src.hl = src.highlight;
  const out = { ...DEFAULT_THEME };
  for (const k of THEME_KEYS) {
    const v = src[k];
    if (typeof v === "string" && HEX.test(v)) out[k] = v.toUpperCase();
  }
  return out;
}

export function presetTheme(preset: Partial<Theme>): Theme {
  return { ...DEFAULT_THEME, ...preset };
}

// Which preset (if any) the theme currently is — every key the preset sets
// has to match, as in the prototype's matchPreset().
export function matchPreset(theme: Theme, presets: Record<string, Partial<Theme>>): string | null {
  for (const [name, p] of Object.entries(presets)) {
    if (Object.entries(p).every(([k, v]) => theme[k as ThemeKey]?.toUpperCase() === v?.toUpperCase())) {
      return name;
    }
  }
  return null;
}

function isDark(hex: string) {
  const c = hex.replace("#", "");
  const l =
    (parseInt(c.slice(0, 2), 16) * 0.299 + parseInt(c.slice(2, 4), 16) * 0.587 + parseInt(c.slice(4, 6), 16) * 0.114) /
    255;
  return l < 0.62;
}

// The prototype's applyTheme(): the base tokens, plus the tints derived from
// them (soft backgrounds behind tags, the second rail shade), and the light
// rail theme when the rail colour is light enough to need dark text.
export function applyTheme(theme: Theme) {
  const r = document.documentElement.style;
  r.setProperty("--action", theme.action);
  r.setProperty("--ink", theme.ink);
  r.setProperty("--canvas", theme.canvas);
  r.setProperty("--surface", theme.surface);
  r.setProperty("--line", theme.line);
  r.setProperty("--rail", theme.rail);
  r.setProperty("--amber", theme.amber);
  r.setProperty("--green", theme.green);
  r.setProperty("--rose", theme.rose);
  r.setProperty("--hl", theme.hl);
  r.setProperty("--private", theme.private);
  r.setProperty("--private-bg", theme.private + "14");
  r.setProperty("--action-soft", theme.action + "14");
  r.setProperty("--blue", theme.action);
  r.setProperty("--blue-bg", theme.action + "14");
  r.setProperty("--amber-bg", theme.amber + "16");
  r.setProperty("--green-bg", theme.green + "1E");
  r.setProperty("--rose-bg", theme.rose + "16");
  r.setProperty("--rail-2", theme.rail + "CC");
  document.body.classList.toggle("lightrail", !isDark(theme.rail));
}

// Equality for theme/preset objects that ignores key order — jsonb gives
// keys back in its own order, so a plain JSON.stringify comparison calls
// an unchanged saved preset "different".
export function sameColours(a: unknown, b: unknown): boolean {
  const canon = (v: unknown): unknown =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v as object)
            .sort()
            .map((k) => [k, canon((v as Record<string, unknown>)[k])]),
        )
      : v;
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}
