"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Storage buckets/upload aren't wired up yet (that's its own phase) — this
// just resolves whatever is in creative_versions.asset.storage_key today.
// A missing bucket fails the query rather than the render; callers show the
// "no artwork" state on error same as on empty data.
export function useAssetSignedUrl(storageKey: string | undefined) {
  return useQuery({
    queryKey: ["asset-signed-url", storageKey],
    queryFn: async (): Promise<string> => {
      const supabase = createClient();
      const { data, error } = await supabase.storage
        .from("assets")
        .createSignedUrl(storageKey!, 3600);

      if (error) throw error;
      return data.signedUrl;
    },
    enabled: !!storageKey,
    retry: false,
  });
}
