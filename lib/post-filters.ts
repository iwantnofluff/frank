import { postFormats } from "./formats.ts";
import { IDEA, isIdea, stageLabel } from "./stage-labels.ts";

// The planner's filters (direct instruction): status by the stages a
// post moves through (the older bands, Changes Requested / Rejected, went;
// In Production is a stage again, phase102), plus Idea for a post with no
// date yet, any combination of them at once; and platform by the formats
// a post goes out as.
export type StatusKey = "idea" | "1" | "2" | "3" | "4" | "5" | "6";
export type PlatformFilter = "all" | "meta" | "linkedin" | "pinterest" | "youtube";

export const STATUS_OPTIONS: { value: StatusKey; label: string }[] = [
  { value: "idea", label: `0. ${IDEA.label}` },
  ...([1, 2, 3, 4, 5, 6] as const).map((n) => ({ value: String(n) as StatusKey, label: `${n}. ${stageLabel(n, "scheduled")}` })),
];
export const ALL_STATUSES: StatusKey[] = STATUS_OPTIONS.map((o) => o.value);

// What the filter's button says: All Statuses, the one chosen, or how many.
export function statusFilterLabel(statuses: StatusKey[]): string {
  if (statuses.length === ALL_STATUSES.length) return "All Statuses";
  if (statuses.length === 0) return "No Statuses";
  if (statuses.length === 1) return STATUS_OPTIONS.find((o) => o.value === statuses[0])!.label;
  return `${statuses.length} Statuses`;
}

// Which status a post counts as: Idea while it has no date, else its stage.
export function statusKey(post: { stage: number; scheduled_at?: string | null; due_on?: string | null }): StatusKey {
  return isIdea(post) ? "idea" : (String(post.stage) as StatusKey);
}

export const PLATFORM_FILTERS: { value: PlatformFilter; label: string }[] = [
  { value: "all", label: "All Platforms" },
  { value: "meta", label: "Meta" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "pinterest", label: "Pinterest" },
  { value: "youtube", label: "YouTube" },
];

// Which platform a format belongs to: Meta covers Instagram, Facebook,
// Meta's own placements and WhatsApp. Anything else (ads elsewhere, email,
// print…) is under none of them, so shows only with All Platforms.
export function platformOf(formatId: string): PlatformFilter | null {
  if (/^(ig|fb|meta|wa)_/.test(formatId)) return "meta";
  if (formatId.startsWith("li_")) return "linkedin";
  if (formatId === "pin" || formatId.startsWith("pin_")) return "pinterest";
  if (formatId.startsWith("yt_")) return "youtube";
  return null;
}

export interface PostFilter {
  statuses: StatusKey[];
  platform: PlatformFilter;
}

export const NO_FILTER: PostFilter = { statuses: ALL_STATUSES, platform: "all" };

// Whether a post shows: its status (Idea or stage), and any of its formats
// on the platform.
export function matchesFilter(
  post: { stage: number; format: string | null; formats?: string[] | null; scheduled_at?: string | null; due_on?: string | null },
  filter: PostFilter,
): boolean {
  if (!filter.statuses.includes(statusKey(post))) return false;
  if (filter.platform !== "all" && !postFormats(post).some((f) => platformOf(f) === filter.platform)) return false;
  return true;
}
