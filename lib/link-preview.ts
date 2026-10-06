// Reading a page's preview details (Open Graph and friends) for the hover
// card on a post's references (direct instruction). Pure parsing and
// address checks here, unit-tested; the fetching is in
// app/api/link-preview/route.ts.

export interface LinkPreview {
  url: string; // where the page ended up, after redirects
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

// Whether an IP address is one Frank's server must never be pointed at:
// loopback, private networks, link-local (cloud metadata lives at
// 169.254.169.254), carrier-grade NAT, multicast and the like.
export function isPrivateAddress(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  const m = v4.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  return (
    v6 === "::" ||
    v6 === "::1" ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") ||
    v6.startsWith("fe8") ||
    v6.startsWith("fe9") ||
    v6.startsWith("fea") ||
    v6.startsWith("feb") ||
    v6.startsWith("ff")
  );
}

// An address worth fetching at all: http(s), no credentials, a real host
// name or a public IP, the usual ports.
export function fetchableUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "80" && url.port !== "443") return null;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    return null;
  }
  if (/^[\d.]+$/.test(host) || host.includes(":")) {
    if (isPrivateAddress(host)) return null;
  }
  return url;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decode(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (all, name) => ENTITIES[name.toLowerCase()] ?? all)
    .replace(/\s+/g, " ")
    .trim();
}

// A <meta>'s content, by property or name, whichever order its
// attributes come in.
function meta(html: string, keys: string[]): string | null {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (!key || !keys.includes(key)) continue;
    const content = tag.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] ?? tag.match(/\bcontent\s*=\s*'([^']*)'/i)?.[1];
    if (content && content.trim()) return decode(content);
  }
  return null;
}

// The preview details from a page's HTML: Open Graph first, then Twitter's
// card tags, then the plain <title> and description. Relative image
// addresses are resolved against the page's own address.
export function parsePreview(html: string, pageUrl: string): LinkPreview {
  // All of what was read (up to 1MB): some pages put their preview tags
  // far down (YouTube's sit about 700KB in).
  const head = html;
  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const rawImage = meta(head, ["og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src"]);
  let image: string | null = null;
  if (rawImage) {
    try {
      const resolved = new URL(rawImage, pageUrl);
      if (resolved.protocol === "https:" || resolved.protocol === "http:") image = resolved.toString();
    } catch {
      image = null;
    }
  }
  const clip = (t: string | null, n: number) => (t && t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
  return {
    url: pageUrl,
    title: clip(meta(head, ["og:title", "twitter:title"]) ?? (titleTag ? decode(titleTag) : null), 160),
    description: clip(meta(head, ["og:description", "twitter:description", "description"]), 300),
    image,
    siteName: meta(head, ["og:site_name"]) ?? new URL(pageUrl).hostname.replace(/^www\./, ""),
  };
}
