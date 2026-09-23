// Ported from the prototype's TYPE_OPTS — the Type select's options cascade
// on which delivery kind is picked. projects.type is free text and stores
// this value directly (no separate key/label split, unlike creatives.format
// — see lib/formats.ts's comment on why that one differs).
export const PROJECT_TYPE_OPTS: Record<"scheduled" | "continuous", string[]> = {
  scheduled: ["Social media", "Paid campaign", "Launch", "Other"],
  continuous: ["Amazon", "Web", "Email", "Print and events", "Other"],
};
