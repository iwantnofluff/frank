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
const SIGN_FOR_S = 12 * 3600;
const REUSE_UNTIL_MS = 60 * 60 * 1000; // stop reusing an hour before expiry
const STORE = "frank:signed-urls";

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

function cached(ids: string[]): Record<string, string> {
  if (typeof window === "undefined") return {};
  const now = Date.now();
  const out: Record<string, string> = {};
  for (const id of ids) {
    const e = load().get(id);
    if (e && e.expires - REUSE_UNTIL_MS > now) out[id] = e.url;
  }
  return out;
}

// Called on sign out: nothing of this session's pictures stays behind.
export function forgetSignedUrls() {
  cache = new Map();
  try {
    window.localStorage.removeItem(STORE);
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
