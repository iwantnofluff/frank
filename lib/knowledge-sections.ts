// The fixed sections of the client knowledge folder (spec section 22), with
// About first (direct instruction). Fixed by design — users cannot add,
// remove or rename them.
export const KNOWLEDGE_SECTIONS = [
  { key: "about", label: "About" },
  { key: "tone", label: "Tone of Voice" },
  { key: "audience", label: "Target Audience" },
  { key: "features", label: "Prioritised Features" },
  { key: "brand_research", label: "Brand Research" },
  { key: "products", label: "Products and Services" },
  { key: "brands_admired", label: "Brands They Look Up To" },
  // The client's industry's dates (direct instruction, 28 Nov 2026):
  // awards, festivals, trade events and special days worth planning around.
  { key: "industry_dates", label: "Industry Dates, Events and Special Occasions" },
  // Client Rules (direct instruction, 28 Nov 2026; was Protected Terms):
  // the key stays, so existing notes and proofreading keep working.
  { key: "protected_terms", label: "Client Rules" },
  { key: "moodboard", label: "Moodboard and References" },
] as const;

export type KnowledgeSectionKey = (typeof KNOWLEDGE_SECTIONS)[number]["key"];

// A note still to be written: every client starts with some reading
// "Pending" (phase172). Frank skips them, so nothing it writes or checks
// leans on a placeholder.
export const PENDING_NOTE = "Pending";
export function isPendingNote(entry: { kind?: string | null; body?: string | null }): boolean {
  return (entry.kind ?? "text") === "text" && (entry.body ?? "").trim().toLowerCase() === "pending";
}
