"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Profile photos and logos are private storage objects, so each needs a
// signed URL. One batched lookup per distinct set of photos on screen,
// rather than one request per avatar.
//
// Each picture keeps its signed URL, across every screen and across a
// reload, until it's near expiry (direct instruction: no logo or photo
// flashing in as a page opens). A fresh URL each time was a new address to
// the browser, so it downloaded the picture again while initials showed in
// its place. Signing out clears it (forgetSignedUrls).
//
// That wasn't enough on a reload (reported directly: the clients' logos
// blinked every time): storage serves signed files as "no-cache", so the
// browser asks Tokyo again before drawing each one. So each picture is also
// kept as a small copy in this browser the first time it's shown, and
// shown from that copy from then on, with nothing to fetch. A picture
// never changes under its id (a new logo is a new asset), so a copy can't
// go stale. Signing out clears the copies too.
const SIGN_FOR_S = 12 * 3600;
const REUSE_UNTIL_MS = 60 * 60 * 1000; // stop reusing an hour before expiry
const STORE = "frank:signed-urls";
const COPIES = "frank:picture-copies";
// Big enough for the largest place a picture is shown, small enough that
// dozens fit in the browser's storage.
const COPY_PX = 320;
const MAX_COPIES = 80;

type Entry = { url: string; expires: number };
let cache: Map<string, Entry> | null = null;

function load(): Map<string, Entry> {
  if (cache) return cache;
  cache = new Map();
  try {
    const raw = window.localStorage.getItem(STORE);
    if (raw) for (const [id, e] of Object.entries(JSON.parse(raw) as Record<string, Entry>)) cache.set(id, e);
  } catch {
    // Storage unavailable (a private window): this tab's memory only.
  }
  return cache;
}

function save() {
  try {
    const now = Date.now();
    const live = [...load()].filter(([, e]) => e.expires - REUSE_UNTIL_MS > now);
    window.localStorage.setItem(STORE, JSON.stringify(Object.fromEntries(live)));
  } catch {
    // Not kept past this tab; fine.
  }
}

let copies: Map<string, string> | null = null;

function loadCopies(): Map<string, string> {
  if (copies) return copies;
  copies = new Map();
  try {
    const raw = window.localStorage.getItem(COPIES);
    if (raw) for (const [id, url] of Object.entries(JSON.parse(raw) as Record<string, string>)) copies.set(id, url);
  } catch {
    // Storage unavailable: no copies kept.
  }
  return copies;
}

// The picture drawn small onto a canvas and kept as a data URL, in the
// background, once it's been signed. Any failure just means no copy.
function keepCopy(id: string, url: string) {
  if (loadCopies().has(id)) return;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      const scale = Math.min(1, COPY_PX / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      // WebP keeps a logo's transparency and is small; Safari falls back to PNG.
      const data = canvas.toDataURL("image/webp", 0.9);
      const all = loadCopies();
      all.set(id, data);
      // The newest are kept when there are too many.
      while (all.size > MAX_COPIES) all.delete(all.keys().next().value!);
      window.localStorage.setItem(COPIES, JSON.stringify(Object.fromEntries(all)));
    } catch {
      // Too big to keep, or the canvas refused: shown as before.
    }
  };
  img.src = url;
}

// A kept copy first (nothing to fetch), else a signed URL still good.
function cached(ids: string[]): Record<string, string> {
  if (typeof window === "undefined") return {};
  const now = Date.now();
  const out: Record<string, string> = {};
  for (const id of ids) {
    const copy = loadCopies().get(id);
    if (copy) {
      out[id] = copy;
      continue;
    }
    const e = load().get(id);
    if (e && e.expires - REUSE_UNTIL_MS > now) {
      out[id] = e.url;
      keepCopy(id, e.url);
    }
  }
  return out;
}

// Called on sign out: nothing of this session's pictures stays behind.
export function forgetSignedUrls() {
  cache = new Map();
  copies = new Map();
  try {
    window.localStorage.removeItem(STORE);
    window.localStorage.removeItem(COPIES);
  } catch {
    // Nothing kept.
  }
}

export function useAvatarUrls(assetIds: (string | null | undefined)[]) {
  const ids = [...new Set(assetIds.filter((id): id is string => !!id))].sort();
  return useQuery({
    queryKey: ["avatar-urls", ids],
    queryFn: async (): Promise<Record<string, string>> => {
      const have = cached(ids);
      const missing = ids.filter((id) => !have[id]);
      if (!missing.length) return have;
      const supabase = createClient();
      const { data: assets, error } = await supabase
        .from("assets")
        .select("id, storage_key")
        .in("id", missing);
      if (error) throw error;
      if (!assets.length) return have;
      const { data: signed, error: signError } = await supabase.storage
        .from("assets")
        .createSignedUrls(
          assets.map((a) => a.storage_key),
          SIGN_FOR_S,
        );
      if (signError) throw signError;
      const byKey = new Map(signed.map((s) => [s.path, s.signedUrl]));
      const expires = Date.now() + SIGN_FOR_S * 1000;
      const fresh: Record<string, string> = {};
      for (const a of assets) {
        const url = byKey.get(a.storage_key);
        if (!url) continue;
        fresh[a.id] = url;
        load().set(a.id, { url, expires });
        keepCopy(a.id, url);
      }
      save();
      return { ...have, ...fresh };
    },
    // Known already: shown at once, no fetch, no flash.
    initialData: () => {
      const have = cached(ids);
      return Object.keys(have).length === ids.length && ids.length > 0 ? have : undefined;
    },
    enabled: ids.length > 0,
    staleTime: 30 * 60 * 1000,
  });
}
