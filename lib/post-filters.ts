import { postFormats } from "./formats.ts";
import { stageLabel } from "./stage-labels.ts";

// The planner's filters (direct instruction): status by the four stages a
// post moves through (the older bands, In Production / Changes Requested /
// Rejected, went), and platform by the formats a post goes out as.
export type StatusFilter = "all" | "1" | "2" | "3" | "4";
export type PlatformFilter = "all" | "meta" | "linkedin" | "pinterest" | "youtube";

export const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All Statuses" },
  ...([1, 2, 3, 4] as const).map((n) => ({ value: String(n) as StatusFilter, label: `${n}. ${stageLabel(n, "scheduled")}` })),
];

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
  status: StatusFilter;
  platform: PlatformFilter;
}

export const NO_FILTER: PostFilter = { status: "all", platform: "all" };

// Whether a post shows: its stage, and any of its formats on the platform.
export function matchesFilter(
  post: { stage: number; format: string; formats?: string[] | null },
  filter: PostFilter,
): boolean {
  if (filter.status !== "all" && String(post.stage) !== filter.status) return false;
  if (filter.platform !== "all" && !postFormats(post).some((f) => platformOf(f) === filter.platform)) return false;
  return true;
}
