"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { validateUploadFile } from "@/lib/upload-validation";

function probeImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    // Animated GIFs decode inconsistently across browsers for this purpose;
    // width/height are nullable columns, so skipping is a fine fallback.
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

type Supabase = ReturnType<typeof createClient>;

// Puts one file in storage and records it as an asset; returns the asset id.
async function uploadAsset(supabase: Supabase, agencyId: string, creativeId: string, userId: string, file: File) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${agencyId}/${creativeId}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("assets")
    .upload(path, file, { contentType: file.type });
  if (uploadError) throw uploadError;

  const dimensions = await probeImageDimensions(file);

  const { data: asset, error: assetError } = await supabase
    .from("assets")
    .insert({
      agency_id: agencyId,
      storage_key: path,
      filename: file.name,
      mime_type: file.type,
      bytes: file.size,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      created_by: userId,
    })
    .select("id")
    .single();
  if (assetError) {
    // Best-effort — don't leave the file behind with no DB row
    // pointing at it if the insert that was supposed to record it failed.
    await supabase.storage.from("assets").remove([path]);
    throw assetError;
  }
  return asset.id as string;
}

export function useUploadCreativeVersion(
  creativeId: string,
  agencyId: string,
  latestVersionNo: number,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      const validation = validateUploadFile(file);
      if (!validation.ok) throw new Error(validation.message);

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const assetId = await uploadAsset(supabase, agencyId, creativeId, user.id, file);

      const { data: version, error: versionError } = await supabase
        .from("creative_versions")
        .insert({
          creative_id: creativeId,
          version_no: latestVersionNo + 1,
          asset_id: assetId,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (versionError) throw versionError;

      return version.id as string;
    },
    // Awaited rather than fire-and-forget: invalidateQueries resolves once
    // the refetch lands, and useMutation holds the caller's own onSuccess
    // until this one settles — so by the time the page selects the new
    // version as active, the list already contains it. Without the await,
    // there's a window where the freshly created id can't be found in the
    // still-stale cache.
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["creative-versions", creativeId],
      });
    },
  });
}

// One slide of a carousel version being saved: a new file, or a slide
// carried over from an earlier version (its asset, uploaded once, reused).
export type SlideSource = { file: File } | { assetId: string } | null;

// Saves a carousel as one new version: the whole set of slides, in order
// (phase31). Empty slots are skipped but keep their places, so slide 3
// stays slide 3. creative_versions.asset_id holds the first slide, so
// everything that shows one image per version keeps working.
export function useUploadCarouselVersion(creativeId: string, agencyId: string, latestVersionNo: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (slides: SlideSource[]) => {
      for (const s of slides) {
        if (s && "file" in s) {
          const validation = validateUploadFile(s.file);
          if (!validation.ok) throw new Error(validation.message);
        }
      }
      if (!slides.some(Boolean)) throw new Error("Add at least one slide.");

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const placed: { position: number; assetId: string }[] = [];
      for (const [i, s] of slides.entries()) {
        if (!s) continue;
        const assetId = "file" in s ? await uploadAsset(supabase, agencyId, creativeId, user.id, s.file) : s.assetId;
        placed.push({ position: i + 1, assetId });
      }

      const { data: version, error: versionError } = await supabase
        .from("creative_versions")
        .insert({
          creative_id: creativeId,
          version_no: latestVersionNo + 1,
          asset_id: placed[0].assetId,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (versionError) throw versionError;

      const { data: rows, error: slidesError } = await supabase
        .from("creative_version_slides")
        .insert(placed.map((p) => ({ creative_version_id: version.id, position: p.position, asset_id: p.assetId })))
        .select("id");
      if (slidesError) throw slidesError;
      // A blocked insert returns no rows rather than an error.
      if ((rows ?? []).length !== placed.length) throw new Error("Couldn't save every slide.");

      return version.id as string;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["creative-versions", creativeId] });
    },
  });
}
