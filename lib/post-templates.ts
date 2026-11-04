// How each format is drawn on the review screen (decided directly: a post
// looks as it will on its own platform). Social and performance formats,
// and messages, sit in a phone; Other Content's sit in an iPad. Formats not
// given their own look yet are drawn as an Instagram post, as every format
// was before.
export type PostPlatform =
  | "instagram"
  | "facebook"
  | "linkedin"
  | "youtube"
  | "youtube-feed"
  | "pinterest"
  | "whatsapp"
  | "sms"
  | "push"
  | "google-search"
  | "web-ad"
  // Other Content's, in an iPad.
  | "amazon"
  | "email"
  | "browser"
  | "board";

export interface PostTemplate {
  platform: PostPlatform;
  // Full screen, one frame at a time (a Story, a Short).
  story: boolean;
  // A paid placement: Sponsored or Promoted, with a call to action.
  ad: boolean;
  // The copy field that is the post's main text.
  textField: string;
  // Words only: no artwork to show.
  textOnly: boolean;
  // A phone, or an iPad (Other Content's formats, decided directly).
  device: "phone" | "tablet";
}

type Def = Partial<Omit<PostTemplate, "platform">> & { platform: PostPlatform };

const TEMPLATES: Record<string, Def> = {
  ig_feed: { platform: "instagram" },
  ig_carousel: { platform: "instagram" },
  ig_reel: { platform: "instagram" },
  ig_story: { platform: "instagram", story: true },
  meta_feed: { platform: "instagram", ad: true, textField: "primary" },
  meta_carousel: { platform: "instagram", ad: true, textField: "primary" },
  meta_story: { platform: "instagram", ad: true, story: true, textField: "primary" },
  fb_feed: { platform: "facebook" },
  fb_story: { platform: "instagram", story: true },
  wa_status: { platform: "instagram", story: true },
  li_image: { platform: "linkedin" },
  li_doc: { platform: "linkedin" },
  li_video: { platform: "linkedin" },
  li_sponsored: { platform: "linkedin", ad: true, textField: "primary" },
  yt_video: { platform: "youtube", textField: "title" },
  yt_preroll: { platform: "youtube", ad: true, textField: "headline" },
  yt_thumb: { platform: "youtube-feed", textField: "title" },
  yt_short: { platform: "youtube", story: true, textField: "title" },
  pin: { platform: "pinterest", textField: "title" },
  wa_broadcast: { platform: "whatsapp", textField: "body" },
  sms: { platform: "sms", textField: "body", textOnly: true },
  push: { platform: "push", textField: "title", textOnly: true },
  g_rsa: { platform: "google-search", ad: true, textField: "headline", textOnly: true },
  g_display: { platform: "web-ad", ad: true, textField: "headline" },
  g_pmax: { platform: "web-ad", ad: true, textField: "headline" },
  apl_module: { platform: "amazon", textField: "headline", device: "tablet" },
  apl_premium: { platform: "amazon", textField: "headline", device: "tablet" },
  amz_main: { platform: "amazon", textField: "title", device: "tablet" },
  amz_info: { platform: "amazon", textField: "title", device: "tablet" },
  amz_gallery: { platform: "amazon", textField: "title", device: "tablet" },
  amz_sb: { platform: "amazon", ad: true, textField: "headline", device: "tablet" },
  amz_store: { platform: "amazon", textField: "headline", device: "tablet" },
  em_full: { platform: "email", textField: "subject", device: "tablet" },
  em_banner: { platform: "email", textField: "subject", device: "tablet" },
  lp: { platform: "browser", textField: "headline", device: "tablet" },
  web_hero: { platform: "browser", textField: "headline", device: "tablet" },
  blog: { platform: "browser", textField: "title", device: "tablet" },
  deck: { platform: "board", textField: "headline", device: "tablet" },
  ooh: { platform: "board", textField: "headline", device: "tablet" },
  print: { platform: "board", textField: "headline", device: "tablet" },
  packaging: { platform: "board", textField: "headline", device: "tablet" },
  general: { platform: "board", textField: "notes", device: "tablet" },
};

export function postTemplate(format: string | null | undefined): PostTemplate {
  const d: Def = (format && TEMPLATES[format]) || { platform: "instagram" };
  return { story: false, ad: false, textField: "caption", textOnly: false, device: "phone", ...d };
}

// Words only: the post page shows no artwork for these.
export function isTextOnlyFormat(format: string | null | undefined): boolean {
  return postTemplate(format).textOnly;
}

// What a call-to-action button says when the copy has none.
export const DEFAULT_CTA = "Learn more";

// Which way the iPad is held (decided directly: the iPad a fixed size, as
// a real one is). An email reads in portrait, as in the iPad's Mail. A
// plain board (print, slides, Other Creative) turns to suit the artwork:
// portrait when it's taller than wide, by its chosen size, else by the
// artwork's own shape once loaded. Whole pages (Amazon, the web) stay
// landscape.
export type TabletOrientation = "landscape" | "portrait";

export function tabletOrientation(
  format: string | null | undefined,
  size: { w: number; h: number } | null,
  artRatio: number | null,
): TabletOrientation {
  const t = postTemplate(format);
  if (t.platform === "email") return "portrait";
  if (t.platform === "board") {
    const r = size ? size.w / size.h : artRatio;
    return r !== null && r < 1 ? "portrait" : "landscape";
  }
  return "landscape";
}
