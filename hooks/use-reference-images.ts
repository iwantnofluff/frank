"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { assertCanUpload } from "@/lib/upload-guard";
import { friendlyUploadError } from "@/lib/upload-limits";

export interface ReferenceImage {
  id: string;
  assetId: string;
  storageKey: string;
  filename: string;
  url: string | null;
}

// Pasted reference images (phase111): the types Claude reads, up to 5MB
// each (its own limit for one image), up to 8 on a post.
export const REFERENCE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
export const REFERENCE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const REFERENCE_IMAGES_MAX = 8;

export function referenceImageProblem(file: File): string | null {
  if (!REFERENCE_IMAGE_TYPES.includes(file.type)) return "Reference images can be JPG, PNG, GIF or WebP.";
  if (file.size > REFERENCE_IMAGE_MAX_BYTES) return "A reference image can be up to 5MB.";
  return null;
}

// A post's pasted reference images, oldest first, each with a link to
// show it for an hour. The team only (RLS): a Client gets none.
export function useReferenceImages(creativeId: string | null | undefined) {
  return useQuery({
    queryKey: ["reference-images", creativeId],
    queryFn: async (): Promise<ReferenceImage[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("reference_images")
        .select("id, asset_id, created_at")
        .eq("creative_id", creativeId!)
        .order("created_at");
      if (error) throw error;
      if (!data.length) return [];
      // Two plain queries, not an embed (hooks/use-comments.ts's reasoning).
      const { data: assets, error: aError } = await supabase
        .from("assets")
        .select("id, storage_key, filename")
        .in("id", data.map((d) => d.asset_id));
      if (aError) throw aError;
      const keys = (assets ?? []).map((a) => a.storage_key as string);
      const { data: signed } = keys.length
        ? await supabase.storage.from("assets").createSignedUrls(keys, 3600)
        : { data: [] };
      return data.flatMap((d) => {
        const asset = (assets ?? []).find((a) => a.id === d.asset_id);
        if (!asset) return [];
        return [
          {
            id: d.id,
            assetId: d.asset_id,
            storageKey: asset.storage_key as string,
            filename: asset.filename as string,
            url: signed?.find((s) => s.path === asset.storage_key && !s.error)?.signedUrl ?? null,
          },
        ];
      });
    },
    enabled: !!creativeId,
    staleTime: 30 * 60_000,
  });
}

// Pasted or dropped images onto a post's references: each uploaded as an
// asset (the storage limit applies), then linked to the post. A link that
// fails takes its file back out.
// Returns each new link's id and its file's key, in the order given.
export async function uploadReferenceImages(
  agencyId: string,
  creativeId: string,
  files: File[],
): Promise<{ id: string; key: string }[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertCanUpload(agencyId, files.reduce((n, f) => n + f.size, 0));
  const saved: { id: string; key: string }[] = [];
  for (const file of files) {
    const problem = referenceImageProblem(file);
    if (problem) throw new Error(problem);
    const safeName = (file.name || "pasted-image").replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${agencyId}/${creativeId}/references/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from("assets").upload(path, file, { contentType: file.type });
    if (uploadError) throw new Error(friendlyUploadError(uploadError.message));
    const { data: asset, error: assetError } = await supabase
      .from("assets")
      .insert({ agency_id: agencyId, storage_key: path, filename: file.name || "Pasted image", mime_type: file.type, bytes: file.size, created_by: user.id })
      .select("id")
      .single();
    if (assetError || !asset) {
      await supabase.storage.from("assets").remove([path]);
      throw assetError ?? new Error("Couldn't keep the image");
    }
    const { data: link, error: linkError } = await supabase
      .from("reference_images")
      .insert({ creative_id: creativeId, asset_id: asset.id, created_by: user.id })
      .select("id")
      .single();
    if (linkError || !link) {
      await supabase.storage.from("assets").remove([path]);
      throw linkError ?? new Error("Couldn't keep the image");
    }
    saved.push({ id: link.id as string, key: path });
  }
  return saved;
}

export function useAddReferenceImages(creativeId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ agencyId, creativeId: id, files }: { agencyId: string; creativeId?: string; files: File[] }) => {
      const target = id ?? creativeId;
      if (!target) throw new Error("Save the brief first");
      const saved = await uploadReferenceImages(agencyId, target, files);
      return { target, ids: saved.map((s) => s.id) };
    },
    onSuccess: async ({ target }) => {
      await queryClient.invalidateQueries({ queryKey: ["reference-images", target] });
    },
  });
}

// Taking an image off the post's references. The link goes; a blocked
// delete returns no row, so it's checked.
export function useRemoveReferenceImage(creativeId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (image: ReferenceImage) => {
      const supabase = createClient();
      const { data, error } = await supabase.from("reference_images").delete().eq("id", image.id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("You don't have permission to remove this image.");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["reference-images", creativeId] });
    },
  });
}
