import { NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { createClient } from "@/lib/supabase/server";
import { fetchableUrl, isPrivateAddress, parsePreview, type LinkPreview } from "@/lib/link-preview";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

const MAX_BYTES = 1_000_000;
const TIMEOUT_MS = 6_000;
const MAX_REDIRECTS = 4;
const DAY = 24 * 3600_000;

// A day per address, per server instance: hovering the same reference
// again doesn't fetch the page again. Failures are remembered for an hour.
const cache = new Map<string, { at: number; ttl: number; preview: LinkPreview | null }>();

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

// The page's HTML, following redirects by hand so each new address is
// checked too; at most 1MB, within 6 seconds.
async function fetchPage(start: URL): Promise<{ html: string; url: string } | null> {
  let url = start;
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!(await hostIsPublic(url))) return null;
    const res = await fetch(url, {
      redirect: "manual",
      signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; FrankLinkPreview/1.0; +https://beingfrank.app)",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en",
      },
    });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      const nextUrl = next ? fetchableUrl(new URL(next, url).toString()) : null;
      if (!nextUrl) return null;
      url = nextUrl;
      continue;
    }
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html") || !res.body) return null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
    await reader.cancel().catch(() => {});
    return { html: new TextDecoder().decode(Buffer.concat(chunks)), url: url.toString() };
  }
  return null;
}

// A reference link's preview (direct instruction: the hover card on a
// post's references in the tables). Signed-in people only; public web
// addresses only, every redirect included. Null when the page has nothing
// to show or won't be read (Instagram and Facebook often refuse), and the
// card falls back to the address.
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Not signed in", 401);

  const raw = new URL(request.url).searchParams.get("url") ?? "";
  const target = fetchableUrl(raw);
  if (!target) return NextResponse.json({ preview: null });

  const key = target.toString();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return NextResponse.json({ preview: hit.preview });

  let preview: LinkPreview | null = null;
  try {
    const page = await fetchPage(target);
    if (page) {
      const parsed = parsePreview(page.html, page.url);
      preview = parsed.title || parsed.image || parsed.description ? parsed : null;
    }
  } catch {
    preview = null;
  }
  cache.set(key, { at: Date.now(), ttl: preview ? DAY : DAY / 24, preview });
  return NextResponse.json({ preview });
}
