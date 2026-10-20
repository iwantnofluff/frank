import { lookup } from "node:dns/promises";
import { fetchableUrl, isPrivateAddress, parsePreview, type LinkPreview } from "@/lib/link-preview";

// Fetching a reference's page, and its preview image, from Frank's server:
// for the hover card (app/api/link-preview) and for Design with Frank
// (app/api/ai/design-direction). Public web addresses only, every
// redirect checked; small, and quick to give up.

const MAX_BYTES = 2_500_000;
const MAX_IMAGE_BYTES = 4_000_000;
const TIMEOUT_MS = 6_000;
const MAX_REDIRECTS = 4;
const USER_AGENT = "Mozilla/5.0 (compatible; FrankLinkPreview/1.0; +https://beingfrank.app)";

// Every hop's host must resolve only to public addresses (a name can point
// at an internal one, so the name alone isn't checked).
async function hostIsPublic(url: URL): Promise<boolean> {
  try {
    const host = url.hostname.replace(/^\[|\]$/g, "");
    const addresses = await lookup(host, { all: true, verbatim: true });
    return addresses.length > 0 && addresses.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

// A response's body, following redirects by hand so each new address is
// checked too; at most maxBytes, within 6 seconds. Null when the type
// isn't one wanted.
async function fetchBody(
  start: URL,
  accept: string,
  wanted: (contentType: string) => boolean,
  maxBytes: number,
): Promise<{ bytes: Buffer; url: string; contentType: string } | null> {
  let url = start;
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await hostIsPublic(url))) return null;
    const res = await fetch(url, {
      redirect: "manual",
      signal,
      headers: { "user-agent": USER_AGENT, accept, "accept-language": "en" },
    });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      const nextUrl = next ? fetchableUrl(new URL(next, url).toString()) : null;
      if (!nextUrl) return null;
      url = nextUrl;
      continue;
    }
    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!res.ok || !wanted(contentType) || !res.body) return null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
    // An image cut off partway is no use; a page's head is enough.
    const finished = size < maxBytes;
    await reader.cancel().catch(() => {});
    if (!finished && contentType.startsWith("image/")) return null;
    return { bytes: Buffer.concat(chunks), url: url.toString(), contentType };
  }
  return null;
}

// The page's HTML, up to 2.5MB (Pinterest puts a pin's preview tags about
// 1.3MB in).
export async function fetchPage(start: URL): Promise<{ html: string; url: string } | null> {
  const got = await fetchBody(start, "text/html,application/xhtml+xml", (t) => t.includes("html"), MAX_BYTES);
  return got ? { html: new TextDecoder().decode(got.bytes), url: got.url } : null;
}

// A reference's preview details, or null when the page has nothing to show
// or won't be read.
export async function readPreview(raw: string): Promise<LinkPreview | null> {
  const target = fetchableUrl(raw);
  if (!target) return null;
  try {
    const page = await fetchPage(target);
    if (!page) return null;
    const parsed = parsePreview(page.html, page.url);
    return parsed.title || parsed.image || parsed.description ? parsed : null;
  } catch {
    return null;
  }
}

export const READABLE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ReadableImageType = (typeof READABLE_IMAGE_TYPES)[number];

// A preview image, whole, up to 4MB, in a type Claude reads.
export async function fetchImage(raw: string): Promise<{ bytes: Buffer; mediaType: ReadableImageType } | null> {
  const target = fetchableUrl(raw);
  if (!target) return null;
  try {
    const got = await fetchBody(
      target,
      "image/jpeg,image/png,image/webp,image/gif",
      (t) => (READABLE_IMAGE_TYPES as readonly string[]).includes(t),
      MAX_IMAGE_BYTES,
    );
    return got ? { bytes: got.bytes, mediaType: got.contentType as ReadableImageType } : null;
  } catch {
    return null;
  }
}
