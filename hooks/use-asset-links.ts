"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// A post's final asset link (phase126): where the finished creative is, a
// Google Drive folder say. The team's only; one a post.
export function useAssetLink(creativeId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["asset-link", creativeId],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await createClient().from("creative_asset_links").select("url").eq("creative_id", creativeId!).maybeSingle();
      if (error) throw error;
      return (data?.url as string | undefined) ?? null;
    },
    enabled: !!creativeId && enabled,
  });
}

// A table's posts' links, by post.
export function useAssetLinksByCreative(creativeIds: string[], enabled = true) {
  return useQuery({
    queryKey: ["asset-links", [...creativeIds].sort()],
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await createClient().from("creative_asset_links").select("creative_id, url").in("creative_id", creativeIds);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map((r) => [r.creative_id as string, r.url as string]));
    },
    enabled: enabled && creativeIds.length > 0,
  });
}

// Saved, replaced, or with nothing, removed.
export function useSaveAssetLink(creativeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (url: string) => {
      const supabase = createClient();
      const link = url.trim();
      if (!link) {
        const { error } = await supabase.from("creative_asset_links").delete().eq("creative_id", creativeId);
        if (error) throw error;
        return;
      }
      if (!/^https?:\/\//i.test(link)) throw new Error("Paste the whole link, starting with https://");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("creative_asset_links")
        .upsert({ creative_id: creativeId, url: link, updated_by: user?.id ?? null, updated_at: new Date().toISOString() }, { onConflict: "creative_id" })
        .select("creative_id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("You can't change this post's link.");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["asset-link", creativeId], refetchType: "all" });
      await queryClient.invalidateQueries({ queryKey: ["asset-links"], refetchType: "all" });
    },
  });
}
