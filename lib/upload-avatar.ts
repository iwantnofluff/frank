import { createClient } from "@/lib/supabase/client";
import { assertCanUpload } from "@/lib/upload-guard";

export const AVATAR_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
// What someone may pick, before cropping. Phone photos are routinely over
// 5 MB; what's actually uploaded is the 512 px crop (lib/face-crop.ts).
export const AVATAR_SOURCE_MAX_BYTES = 25 * 1024 * 1024;

export function validateAvatarSource(file: File): string | null {
  if (!AVATAR_TYPES.includes(file.type)) return "Use a JPG, PNG or WebP image";
  if (file.size > AVATAR_SOURCE_MAX_BYTES) return "Use an image under 25 MB";
  return null;
}

export function validateAvatar(file: File): string | null {
  if (!AVATAR_TYPES.includes(file.type)) return "Use a JPG, PNG or WebP image";
  if (file.size > AVATAR_MAX_BYTES) return "Use an image under 5 MB";
  return null;
}

// Same shape as uploadKnowledgeAsset: file first, then its assets row,
// then point the caller's own users row at it. Path is
// {agency_id}/avatars/{user_id}/{uuid}-{filename} — the bucket policies
// (phase8_storage.sql) only look at the agency segment, so staff can upload
// here and every member of the agency can read it.
export async function uploadAvatar(agencyId: string, file: File): Promise<string> {
  const problem = validateAvatar(file);
  if (problem) throw new Error(problem);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  await assertCanUpload(agencyId, file.size);

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${agencyId}/avatars/${user.id}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("assets")
    .upload(path, file, { contentType: file.type });
  if (uploadError) throw uploadError;

  const { data: asset, error: assetError } = await supabase
    .from("assets")
    .insert({
      agency_id: agencyId,
      storage_key: path,
      filename: file.name,
      mime_type: file.type,
      bytes: file.size,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (assetError) {
    await supabase.storage.from("assets").remove([path]);
    throw assetError;
  }

  const { data: updated, error: userError } = await supabase
    .from("users")
    .update({ avatar_asset_id: asset.id })
    .eq("id", user.id)
    .select("id");
  if (userError) throw userError;
  if (!updated?.length) throw new Error("Couldn't save your photo to your profile");

  return asset.id as string;
}
