// The 41-format catalog, ported from the prototype's FORMATS object
// (frank-prototype.html). Application data, not a schema decision — the
// format_directions table's own comment already says the format list
// "lives in application data, not the database." creatives.format still
// stores the key (id below), never the label — matches that column's own
// comment, and deliberately diverges from the prototype's own save
// handler, which stores the label instead.
export interface FormatDefinition {
  id: string;
  category: string;
  label: string;
  aspectRatio: string;
  // Which copy_versions.fields keys this format actually uses — also
  // ported from the prototype's own FORMATS object (its `copy` array),
  // not invented here. copy_versions.fields is a plain jsonb object, so
  // no schema change was needed to support this — only which keys the UI
  // renders and drafts for changes per format. An empty array is real
  // data, not a gap: Instagram Story, Facebook Story, WhatsApp Status,
  // the Amazon image-only listings, Presentation Slide and Packaging all
  // have nothing beyond Text on Image (already a separate, brief-level
  // field, not part of this list).
  copyFields: string[];
}

// Key -> human label, ported verbatim from the prototype's COPYLBL.
export const COPY_FIELD_LABELS: Record<string, string> = {
  caption: "Caption",
  alt: "Alt Text",
  hook: "On-screen Hook",
  title: "Title",
  description: "Description",
  primary: "Primary Text",
  headline: "Headline",
  cta: "Call to Action",
  body: "Body Copy",
  subject: "Subject Line",
  preview: "Preview Text",
  notes: "Notes",
};

// Category order matches the prototype's FORMATS object, since that's the
// order a Content Type select should offer them in.
export const FORMAT_CATEGORIES = [
  "Social — organic",
  "Performance marketing",
  "Amazon",
  "Email and messaging",
  "Web and print",
  "General",
] as const;

export const FORMATS: FormatDefinition[] = [
  // Social — organic
  { id: "ig_feed", category: "Social — organic", label: "Instagram Feed", aspectRatio: "4:5", copyFields: ["caption", "alt"] },
  { id: "ig_carousel", category: "Social — organic", label: "Instagram Carousel", aspectRatio: "4:5", copyFields: ["caption", "alt"] },
  { id: "ig_reel", category: "Social — organic", label: "Instagram Reel", aspectRatio: "9:16", copyFields: ["caption", "hook"] },
  { id: "ig_story", category: "Social — organic", label: "Instagram Story", aspectRatio: "9:16", copyFields: [] },
  { id: "fb_feed", category: "Social — organic", label: "Facebook Feed Post", aspectRatio: "1.91:1", copyFields: ["caption"] },
  { id: "fb_story", category: "Social — organic", label: "Facebook Story", aspectRatio: "9:16", copyFields: [] },
  { id: "li_image", category: "Social — organic", label: "LinkedIn Single Image", aspectRatio: "1.91:1", copyFields: ["caption"] },
  { id: "li_doc", category: "Social — organic", label: "LinkedIn Carousel (Document)", aspectRatio: "1:1", copyFields: ["caption"] },
  { id: "li_video", category: "Social — organic", label: "LinkedIn Video", aspectRatio: "16:9", copyFields: ["caption"] },
  { id: "yt_video", category: "Social — organic", label: "YouTube Video", aspectRatio: "16:9", copyFields: ["title", "description"] },
  { id: "yt_short", category: "Social — organic", label: "YouTube Short", aspectRatio: "9:16", copyFields: ["title"] },
  { id: "yt_thumb", category: "Social — organic", label: "YouTube Thumbnail", aspectRatio: "16:9", copyFields: ["title"] },
  { id: "wa_status", category: "Social — organic", label: "WhatsApp Status", aspectRatio: "9:16", copyFields: [] },
  { id: "pin", category: "Social — organic", label: "Pinterest Pin", aspectRatio: "2:3", copyFields: ["title", "description"] },

  // Performance marketing
  { id: "meta_feed", category: "Performance marketing", label: "Meta Feed Ad", aspectRatio: "1:1", copyFields: ["primary", "headline", "description", "cta"] },
  { id: "meta_story", category: "Performance marketing", label: "Meta Stories / Reels Ad", aspectRatio: "9:16", copyFields: ["primary", "headline", "cta"] },
  { id: "meta_carousel", category: "Performance marketing", label: "Meta Carousel Ad", aspectRatio: "1:1", copyFields: ["primary", "headline", "cta"] },
  { id: "g_display", category: "Performance marketing", label: "Google Display Banner", aspectRatio: "multi", copyFields: ["headline", "description"] },
  { id: "g_rsa", category: "Performance marketing", label: "Google Responsive Search Ad", aspectRatio: "—", copyFields: ["headline", "description"] },
  { id: "g_pmax", category: "Performance marketing", label: "Performance Max Asset Group", aspectRatio: "multi", copyFields: ["headline", "description", "cta"] },
  { id: "yt_preroll", category: "Performance marketing", label: "YouTube Pre-roll / Bumper", aspectRatio: "16:9", copyFields: ["headline", "cta"] },
  { id: "li_sponsored", category: "Performance marketing", label: "LinkedIn Sponsored Content", aspectRatio: "1.91:1", copyFields: ["primary", "headline", "cta"] },

  // Amazon
  { id: "apl_module", category: "Amazon", label: "A+ Content Module", aspectRatio: "1.6:1", copyFields: ["headline", "body"] },
  { id: "apl_premium", category: "Amazon", label: "A+ Premium Module", aspectRatio: "2.4:1", copyFields: ["headline", "body"] },
  { id: "amz_main", category: "Amazon", label: "Listing Main Image", aspectRatio: "1:1", copyFields: [] },
  { id: "amz_info", category: "Amazon", label: "Listing Infographic", aspectRatio: "1:1", copyFields: [] },
  { id: "amz_sb", category: "Amazon", label: "Sponsored Brands Banner", aspectRatio: "1.91:1", copyFields: ["headline"] },
  { id: "amz_store", category: "Amazon", label: "Storefront Tile", aspectRatio: "2:1", copyFields: ["headline"] },

  // Email and messaging
  { id: "em_full", category: "Email and messaging", label: "Email Campaign", aspectRatio: "—", copyFields: ["subject", "preview", "body"] },
  { id: "em_banner", category: "Email and messaging", label: "Email Header Banner", aspectRatio: "3:1", copyFields: ["subject"] },
  { id: "wa_broadcast", category: "Email and messaging", label: "WhatsApp Broadcast", aspectRatio: "1:1", copyFields: ["body"] },
  { id: "sms", category: "Email and messaging", label: "SMS", aspectRatio: "—", copyFields: ["body"] },
  { id: "push", category: "Email and messaging", label: "Push Notification", aspectRatio: "—", copyFields: ["title", "body"] },

  // Web and print
  { id: "lp", category: "Web and print", label: "Landing Page", aspectRatio: "—", copyFields: ["headline", "body", "cta"] },
  { id: "web_hero", category: "Web and print", label: "Website Banner / Hero", aspectRatio: "2.4:1", copyFields: ["headline", "cta"] },
  { id: "blog", category: "Web and print", label: "Blog Header", aspectRatio: "16:9", copyFields: ["title"] },
  { id: "deck", category: "Web and print", label: "Presentation Slide", aspectRatio: "16:9", copyFields: [] },
  { id: "ooh", category: "Web and print", label: "Hoarding / OOH", aspectRatio: "varies", copyFields: ["headline"] },
  { id: "print", category: "Web and print", label: "Print — Flyer or Poster", aspectRatio: "varies", copyFields: ["headline", "body"] },
  { id: "packaging", category: "Web and print", label: "Packaging", aspectRatio: "varies", copyFields: [] },

  // General
  { id: "general", category: "General", label: "Other Creative", aspectRatio: "—", copyFields: ["notes"] },
];

export function formatById(id: string): FormatDefinition | undefined {
  return FORMATS.find((f) => f.id === id);
}

export function formatsByCategory(category: string): FormatDefinition[] {
  return FORMATS.filter((f) => f.category === category);
}
