import type { CustomColumnRow, CustomColumnType } from "@/hooks/use-custom-columns";

// What each built-in planner column holds, shown beside it where columns
// are chosen (direct instruction: a column's type visible, not editable).
const BUILT_IN_TYPES: Record<string, string> = {
  time: "Time",
  status: "Stage",
  type: "Formats",
  slides: "Number",
  lead: "People",
  creative: "Post name and artwork",
  concept: "Large Text and links",
  conceptRef: "Large Text and links",
  voiceover: "Large Text",
  imageOnText: "Copy",
  postCopy: "Copy",
  copy: "Copy",
  altText: "Copy",
  approach: "Copy",
  clientFeedback: "Comments",
  placement: "Single Line Text",
  funnel: "Dropdown",
  tg: "Single Line Text",
  finalCreative: "Artwork",
  notes: "Large Text",
  principles: "Single Line Text",
};

const CUSTOM_TYPES: Record<CustomColumnType, string> = {
  text: "Single Line Text",
  long_text: "Large Text",
  number: "Number",
  date: "Date",
  dropdown: "Dropdown",
  checkbox: "Checkbox",
  status: "Status",
};

export function customTypeLabel(type: CustomColumnType): string {
  return CUSTOM_TYPES[type];
}

// A column's type label, by its planner key (`cx:<id>` for a project's own).
export function columnTypeLabel(key: string, custom?: CustomColumnRow): string {
  if (custom) return CUSTOM_TYPES[custom.type];
  return BUILT_IN_TYPES[key] ?? "";
}
