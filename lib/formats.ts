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
}

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
  { id: "ig_feed", category: "Social — organic", label: "Instagram Feed", aspectRatio: "4:5" },
  { id: "ig_carousel", category: "Social — organic", label: "Instagram Carousel", aspectRatio: "4:5" },
  { id: "ig_reel", category: "Social — organic", label: "Instagram Reel", aspectRatio: "9:16" },
  { id: "ig_story", category: "Social — organic", label: "Instagram Story", aspectRatio: "9:16" },
  { id: "fb_feed", category: "Social — organic", label: "Facebook Feed Post", aspectRatio: "1.91:1" },
  { id: "fb_story", category: "Social — organic", label: "Facebook Story", aspectRatio: "9:16" },
  { id: "li_image", category: "Social — organic", label: "LinkedIn Single Image", aspectRatio: "1.91:1" },
  { id: "li_doc", category: "Social — organic", label: "LinkedIn Carousel (Document)", aspectRatio: "1:1" },
  { id: "li_video", category: "Social — organic", label: "LinkedIn Video", aspectRatio: "16:9" },
  { id: "yt_video", category: "Social — organic", label: "YouTube Video", aspectRatio: "16:9" },
  { id: "yt_short", category: "Social — organic", label: "YouTube Short", aspectRatio: "9:16" },
  { id: "yt_thumb", category: "Social — organic", label: "YouTube Thumbnail", aspectRatio: "16:9" },
  { id: "wa_status", category: "Social — organic", label: "WhatsApp Status", aspectRatio: "9:16" },
  { id: "pin", category: "Social — organic", label: "Pinterest Pin", aspectRatio: "2:3" },

  // Performance marketing
  { id: "meta_feed", category: "Performance marketing", label: "Meta Feed Ad", aspectRatio: "1:1" },
  { id: "meta_story", category: "Performance marketing", label: "Meta Stories / Reels Ad", aspectRatio: "9:16" },
  { id: "meta_carousel", category: "Performance marketing", label: "Meta Carousel Ad", aspectRatio: "1:1" },
  { id: "g_display", category: "Performance marketing", label: "Google Display Banner", aspectRatio: "multi" },
  { id: "g_rsa", category: "Performance marketing", label: "Google Responsive Search Ad", aspectRatio: "—" },
  { id: "g_pmax", category: "Performance marketing", label: "Performance Max Asset Group", aspectRatio: "multi" },
  { id: "yt_preroll", category: "Performance marketing", label: "YouTube Pre-roll / Bumper", aspectRatio: "16:9" },
  { id: "li_sponsored", category: "Performance marketing", label: "LinkedIn Sponsored Content", aspectRatio: "1.91:1" },

  // Amazon
  { id: "apl_module", category: "Amazon", label: "A+ Content Module", aspectRatio: "1.6:1" },
  { id: "apl_premium", category: "Amazon", label: "A+ Premium Module", aspectRatio: "2.4:1" },
  { id: "amz_main", category: "Amazon", label: "Listing Main Image", aspectRatio: "1:1" },
  { id: "amz_info", category: "Amazon", label: "Listing Infographic", aspectRatio: "1:1" },
  { id: "amz_sb", category: "Amazon", label: "Sponsored Brands Banner", aspectRatio: "1.91:1" },
  { id: "amz_store", category: "Amazon", label: "Storefront Tile", aspectRatio: "2:1" },

  // Email and messaging
  { id: "em_full", category: "Email and messaging", label: "Email Campaign", aspectRatio: "—" },
  { id: "em_banner", category: "Email and messaging", label: "Email Header Banner", aspectRatio: "3:1" },
  { id: "wa_broadcast", category: "Email and messaging", label: "WhatsApp Broadcast", aspectRatio: "1:1" },
  { id: "sms", category: "Email and messaging", label: "SMS", aspectRatio: "—" },
  { id: "push", category: "Email and messaging", label: "Push Notification", aspectRatio: "—" },

  // Web and print
  { id: "lp", category: "Web and print", label: "Landing Page", aspectRatio: "—" },
  { id: "web_hero", category: "Web and print", label: "Website Banner / Hero", aspectRatio: "2.4:1" },
  { id: "blog", category: "Web and print", label: "Blog Header", aspectRatio: "16:9" },
  { id: "deck", category: "Web and print", label: "Presentation Slide", aspectRatio: "16:9" },
  { id: "ooh", category: "Web and print", label: "Hoarding / OOH", aspectRatio: "varies" },
  { id: "print", category: "Web and print", label: "Print — Flyer or Poster", aspectRatio: "varies" },
  { id: "packaging", category: "Web and print", label: "Packaging", aspectRatio: "varies" },

  // General
  { id: "general", category: "General", label: "Other Creative", aspectRatio: "—" },
];

export function formatById(id: string): FormatDefinition | undefined {
  return FORMATS.find((f) => f.id === id);
}

export function formatsByCategory(category: string): FormatDefinition[] {
  return FORMATS.filter((f) => f.category === category);
}
