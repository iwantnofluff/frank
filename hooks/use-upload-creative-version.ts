"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { validateUploadFile, MAX_STORED_VIDEO_BYTES } from "@/lib/upload-validation";
import { compressVideo } from "@/lib/compress-video";
import { uploadWithProgress } from "@/lib/upload-with-progress";

// Where a save has got to, for the progress bar: which file of how many,
// and whether it's being compressed (videos) or uploaded.
export interface UploadProgress {
  stage: "compressing" | "uploading";
  fraction: number; // 0–1 through this stage of this file
  file: number; // 1-based
  files: number;
  loaded?: number; // bytes, while uploading
  total?: number;
}
type OnProgress = (p: UploadProgress | null) => void;

// A video is compressed to a 720p review copy before it's stored (decided
// directly — only that copy is kept). Where the browser can't compress,
// the original goes up as long as it fits the 50MB storage limit.
async function prepareForUpload(file: File, onProgress?: (fraction: number) => void): Promise<File> {
  if (!file.type.startsWith("video/")) return file;
  const result = await compressVideo(file, onProgress);
  if (result.file.size > MAX_STORED_VIDEO_BYTES) {
    throw new Error(
      result.kind === "unchanged" && result.reason === "unsupported"
        ? "This browser can't compress video, and the file is over 50MB. Try Chrome or Edge, or export a lighter file."
        : "This video is still over 50MB after compressing. Try a shorter or lighter export.",
    );
  }
  return result.file;
}

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
async function uploadAsset(
  supabase: Supabase,
  agencyId: string,
  creativeId: string,
  userId: string,
  file: File,
  onUploaded?: (loaded: number, total: number) => void,
) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${agencyId}/${creativeId}/${crypto.randomUUID()}-${safeName}`;

  // Same request supabase.storage.upload() makes, but with progress.
  await uploadWithProgress(path, file, onUploaded);

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
  onProgress?: OnProgress,
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

      const ready = await prepareForUpload(file, (fraction) =>
        onProgress?.({ stage: "compressing", fraction, file: 1, files: 1 }),
      );
      const assetId = await uploadAsset(supabase, agencyId, creativeId, user.id, ready, (loaded, total) =>
        onProgress?.({ stage: "uploading", fraction: loaded / total, file: 1, files: 1, loaded, total }),
      );

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
// everything that shows one image per version keeps working. Every slot
// empty saves a version with no images (phase32): the post goes back to
// "No artwork yet", with the earlier versions still in its history.
export function useUploadCarouselVersion(
  creativeId: string,
  agencyId: string,
  latestVersionNo: number,
  onProgress?: OnProgress,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (slides: SlideSource[]) => {
      for (const s of slides) {
        if (s && "file" in s) {
          const validation = validateUploadFile(s.file);
          if (!validation.ok) throw new Error(validation.message);
        }
      }

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const placed: { position: number; assetId: string }[] = [];
      // Only new files are uploaded; slides carried over aren't counted.
      const files = slides.filter((s) => s && "file" in s).length;
      let n = 0;
      for (const [i, s] of slides.entries()) {
        if (!s) continue;
        let assetId: string;
        if ("file" in s) {
          const file = ++n;
          const ready = await prepareForUpload(s.file, (fraction) =>
            onProgress?.({ stage: "compressing", fraction, file, files }),
          );
          assetId = await uploadAsset(supabase, agencyId, creativeId, user.id, ready, (loaded, total) =>
            onProgress?.({ stage: "uploading", fraction: loaded / total, file, files, loaded, total }),
          );
        } else {
          assetId = s.assetId;
        }
        placed.push({ position: i + 1, assetId });
      }

      const { data: version, error: versionError } = await supabase
        .from("creative_versions")
        .insert({
          creative_id: creativeId,
          version_no: latestVersionNo + 1,
          asset_id: placed[0]?.assetId ?? null,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (versionError) throw versionError;

      if (placed.length === 0) return version.id as string;

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
