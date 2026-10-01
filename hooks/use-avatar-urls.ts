"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Profile photos are private storage objects, so each needs a signed URL.
// One batched lookup per distinct set of photos on screen, rather than one
// request per avatar.
export function useAvatarUrls(assetIds: (string | null | undefined)[]) {
  const ids = [...new Set(assetIds.filter((id): id is string => !!id))].sort();
  return useQuery({
    queryKey: ["avatar-urls", ids],
    queryFn: async (): Promise<Record<string, string>> => {
      const supabase = createClient();
      const { data: assets, error } = await supabase
        .from("assets")
        .select("id, storage_key")
        .in("id", ids);
      if (error) throw error;
      if (!assets.length) return {};
      const { data: signed, error: signError } = await supabase.storage
        .from("assets")
        .createSignedUrls(
          assets.map((a) => a.storage_key),
          3600,
        );
      if (signError) throw signError;
      const byKey = new Map(signed.map((s) => [s.path, s.signedUrl]));
      return Object.fromEntries(
        assets
          .map((a) => [a.id, byKey.get(a.storage_key)] as const)
          .filter((pair): pair is readonly [string, string] => !!pair[1]),
      );
    },
    enabled: ids.length > 0,
    staleTime: 30 * 60 * 1000,
  });
}
