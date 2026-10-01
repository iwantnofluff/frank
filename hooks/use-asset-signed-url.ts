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

export function useAssetSignedUrl(storageKey: string | undefined) {
  return useQuery({
    queryKey: ["asset-signed-url", storageKey],
    queryFn: () => signedUrlFor(storageKey!),
    enabled: !!storageKey,
    retry: false,
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
    })),
  });
  const urls = results.map((r) => r.data).filter((u): u is string => !!u);
  const joined = urls.join("\n");
  useEffect(() => {
    for (const u of joined.split("\n")) if (u) new Image().src = u;
  }, [joined]);
}
