import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchableUrl, type LinkPreview } from "@/lib/link-preview";
import { readPreview } from "@/lib/link-fetch";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

const DAY = 24 * 3600_000;

// A day per address, per server instance: hovering the same reference
// again doesn't fetch the page again. Failures are remembered for an hour.
const cache = new Map<string, { at: number; ttl: number; preview: LinkPreview | null }>();

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

  const preview = await readPreview(key);
  cache.set(key, { at: Date.now(), ttl: preview ? DAY : DAY / 24, preview });
  return NextResponse.json({ preview });
}
