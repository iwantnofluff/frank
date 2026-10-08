"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { validateUploadFile, MAX_STORED_VIDEO_BYTES } from "@/lib/upload-validation";
import { compressVideo } from "@/lib/compress-video";
import { uploadWithProgress } from "@/lib/upload-with-progress";
import { assertCanUpload } from "@/lib/upload-guard";
import { MAX_UPLOAD_MB } from "@/lib/upload-limits";

// Where a save has got to, for the progress bar: which file of how many,
// and whether it's being compressed (videos), uploaded, or, with every file
// up, saved as the new version.
export interface UploadProgress {
  stage: "compressing" | "uploading" | "saving";
  fraction: number; // 0–1 through this stage of this file
  file: number; // 1-based
  files: number;
  loaded?: number; // bytes, while uploading
  total?: number;
  // The connection dropped; the upload is about to carry on where it was.
  retrying?: boolean;
}
type OnProgress = (p: UploadProgress | null) => void;

// A video is compressed to a 720p review copy before it's stored (decided
// directly — only that copy is kept). Where the browser can't compress,
// the original goes up as long as it fits the upload limit.
async function prepareForUpload(file: File, onProgress?: (fraction: number) => void): Promise<File> {
  if (!file.type.startsWith("video/")) return file;
  // A compression that fails partway (Chrome can take its video encoder
  // back from a tab that's out of sight) is tried once more before saying so.
  let result;
  try {
    result = await compressVideo(file, onProgress);
  } catch {
    onProgress?.(0);
    try {
      result = await compressVideo(file, onProgress);
    } catch (e) {
      throw new Error(
        `Couldn't compress this video (${(e as Error).message || "the browser stopped"}). Try again, keeping this tab open while it compresses.`,
      );
    }
  }
  if (result.file.size > MAX_STORED_VIDEO_BYTES) {
    throw new Error(
      result.kind === "unchanged" && result.reason === "unsupported"
        ? `This browser can't compress video, and the file is over ${MAX_UPLOAD_MB}MB. Try Chrome or Edge, or export a lighter file.`
        : `This video is still over ${MAX_UPLOAD_MB}MB after compressing. Try a shorter or lighter export.`,
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
  onRetry?: () => void,
) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${agencyId}/${creativeId}/${crypto.randomUUID()}-${safeName}`;
  await assertCanUpload(agencyId, file.size);

  // In confirmed pieces, with progress (lib/upload-with-progress.ts).
  await uploadWithProgress(path, file, onUploaded, onRetry);

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
          let last: UploadProgress = { stage: "uploading", fraction: 0, file, files, loaded: 0, total: ready.size };
          assetId = await uploadAsset(
            supabase,
            agencyId,
            creativeId,
            user.id,
            ready,
            (loaded, total) =>
              onProgress?.((last = { stage: "uploading", fraction: loaded / total, file, files, loaded, total })),
            () => onProgress?.({ ...last, retrying: true }),
          );
        } else {
          assetId = s.assetId;
        }
        placed.push({ position: i + 1, assetId });
      }

      // Every file is up: what's left is recording the version, a moment that
      // used to show as a bar stuck at 100%.
      onProgress?.({ stage: "saving", fraction: 1, file: files, files });
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
