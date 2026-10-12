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
  { key: "protected_terms", label: "Protected Terms" },
  { key: "moodboard", label: "Moodboard and References" },
] as const;

export type KnowledgeSectionKey = (typeof KNOWLEDGE_SECTIONS)[number]["key"];
