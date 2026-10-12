"use client";

import { useEffect } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Storage buckets/upload aren't wired up yet (that's its own phase) — this
// just resolves whatever is in creative_versions.asset.storage_key today.
// A missing bucket fails the query rather than the render; callers show the
// "no artwork" state on error same as on empty data.
async function signedUrlFor(storageKey: string): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from("assets").createSignedUrl(storageKey, 3600);
  if (error) throw error;
  return data.signedUrl;
}

const SIGNED_URL_FRESH_MS = 30 * 60_000;

export function useAssetSignedUrl(storageKey: string | undefined) {
  return useQuery({
    queryKey: ["asset-signed-url", storageKey],
    queryFn: () => signedUrlFor(storageKey!),
    enabled: !!storageKey,
    retry: false,
    // A link lasts an hour; kept for half of it, so the one the server
    // signed for the page is used rather than fetched again (and the image
    // downloaded twice).
    staleTime: SIGNED_URL_FRESH_MS,
  });
}

// Signs, and loads, every slide of a carousel up front — through the same
// cache useAssetSignedUrl reads — so moving to the next slide shows it
// straight away instead of a blank moment while its link is fetched.
export function usePreloadAssets(storageKeys: (string | undefined)[]) {
  const results = useQueries({
    queries: storageKeys.map((key) => ({
      queryKey: ["asset-signed-url", key],
      queryFn: () => signedUrlFor(key!),
      enabled: !!key,
      retry: false,
      staleTime: SIGNED_URL_FRESH_MS,
    })),
  });
  const urls = results.map((r) => r.data).filter((u): u is string => !!u);
  const joined = urls.join("\n");
  useEffect(() => {
    for (const u of joined.split("\n")) if (u) new Image().src = u;
  }, [joined]);
}
