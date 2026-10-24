"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { uploadAsset } from "@/hooks/use-upload-creative-version";

// A video post's Thumbnail (phase118, direct instruction): one image, saved
// as V1, V2 and so on, seen by the team and the post's client as the
// artwork is. Saving one doesn't move the post's stage.

export interface ThumbnailAsset {
  id: string;
  storage_key: string;
  filename: string;
  mime_type: string;
}

export interface ThumbnailVersion {
  id: string;
  versionNo: number;
  createdAt: string;
  // Null once removed with the artwork after going live.
  asset: ThumbnailAsset | null;
}

export const THUMBNAIL_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_THUMBNAIL_BYTES = 20 * 1024 * 1024;

type Row = { id: string; creative_id: string; version_no: number; created_at: string; asset: ThumbnailAsset | null };

// One post's thumbnails, newest first.
export function useThumbnailVersions(creativeId: string | null | undefined) {
  return useQuery({
    queryKey: ["thumbnail-versions", creativeId],
    queryFn: async (): Promise<ThumbnailVersion[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("thumbnail_versions")
        .select("id, creative_id, version_no, created_at, asset:assets(id, storage_key, filename, mime_type)")
        .eq("creative_id", creativeId!)
        .order("version_no", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as Row[]).map((r) => ({ id: r.id, versionNo: r.version_no, createdAt: r.created_at, asset: r.asset }));
    },
    enabled: !!creativeId,
  });
}

// The table's: each post's latest thumbnail with a file, for its Creative
// column.
export function useThumbnailsByCreative(creativeIds: string[]) {
  const key = [...creativeIds].sort().join(",");
  return useQuery({
    queryKey: ["thumbnails-by-creative", key],
    queryFn: async (): Promise<Record<string, ThumbnailAsset>> => {
      if (!creativeIds.length) return {};
      const supabase = createClient();
      const { data, error } = await supabase
        .from("thumbnail_versions")
        .select("id, creative_id, version_no, created_at, asset:assets(id, storage_key, filename, mime_type)")
        .in("creative_id", creativeIds)
        .order("version_no", { ascending: false });
      if (error) throw error;
      const out: Record<string, ThumbnailAsset> = {};
      for (const r of (data ?? []) as unknown as Row[]) {
        if (!out[r.creative_id] && r.asset) out[r.creative_id] = r.asset;
      }
      return out;
    },
    enabled: creativeIds.length > 0,
  });
}

// Saves a file as the next version.
export function useSaveThumbnail(creativeId: string, agencyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, latestVersionNo }: { file: File; latestVersionNo: number }) => {
      if (!THUMBNAIL_TYPES.includes(file.type)) throw new Error("A thumbnail is a JPG, PNG or WebP image.");
      if (file.size > MAX_THUMBNAIL_BYTES) throw new Error("A thumbnail can be up to 20MB.");
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const assetId = await uploadAsset(supabase, agencyId, creativeId, user.id, file);
      const { data, error } = await supabase
        .from("thumbnail_versions")
        .insert({ creative_id: creativeId, version_no: latestVersionNo + 1, asset_id: assetId, created_by: user.id })
        .select("id");
      if (error) {
        if (error.code === "23505") throw new Error("Someone else saved a thumbnail just now. Close and open the post to see it.");
        throw error;
      }
      // A blocked write reports no error, only no row.
      if (!data?.length) throw new Error("You don't have permission to save this post's thumbnail.");
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["thumbnail-versions", creativeId] }),
        queryClient.invalidateQueries({ queryKey: ["thumbnails-by-creative"] }),
      ]);
    },
  });
}
