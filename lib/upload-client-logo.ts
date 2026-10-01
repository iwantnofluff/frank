import { createClient } from "@/lib/supabase/client";
import { AVATAR_TYPES, AVATAR_SOURCE_MAX_BYTES } from "@/lib/upload-avatar";
import { loadImage } from "@/lib/face-crop";

export const CLIENT_LOGO_PX = 512;
// Per direct instruction only square images are accepted. Exports that are
// a pixel or two off (1080x1081) still count; the sliver is trimmed evenly.
const SQUARE_TOLERANCE = 0.01;

// Checks and normalises a picked client image in the browser: square (within
// 1%), resized to 512px. PNG stays PNG so transparent logos keep their
// transparency; anything else becomes JPEG.
export async function prepareClientLogo(file: File): Promise<File> {
  if (!AVATAR_TYPES.includes(file.type)) throw new Error("Use a JPG, PNG or WebP image");
  if (file.size > AVATAR_SOURCE_MAX_BYTES) throw new Error("Use an image under 25 MB");
  const img = await loadImage(file);
  try {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (Math.abs(w - h) > Math.max(w, h) * SQUARE_TOLERANCE) {
      throw new Error(`Use a square image — this one is ${w}×${h}`);
    }
    const side = Math.min(w, h);
    const canvas = document.createElement("canvas");
    canvas.width = CLIENT_LOGO_PX;
    canvas.height = CLIENT_LOGO_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't prepare the image");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, CLIENT_LOGO_PX, CLIENT_LOGO_PX);
    const type = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
    if (!blob) throw new Error("Couldn't prepare the image");
    return new File([blob], type === "image/png" ? "client.png" : "client.jpg", { type });
  } finally {
    URL.revokeObjectURL(img.src);
  }
}

// Same shape as uploadAvatar: file, then its assets row, then point the
// client at it. Path is {agency_id}/client-logos/{client_id}/... — the
// bucket policies only look at the agency segment.
export async function uploadClientLogo(agencyId: string, clientId: string, file: File) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const ext = file.type === "image/png" ? "png" : "jpg";
  const path = `${agencyId}/client-logos/${clientId}/${crypto.randomUUID()}.${ext}`;
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

  const { data: updated, error: clientError } = await supabase
    .from("clients")
    .update({ logo_asset_id: asset.id })
    .eq("id", clientId)
    .select("id");
  if (clientError) throw clientError;
  if (!updated?.length) throw new Error("Couldn't save the image to this client");
}

export async function removeClientLogo(clientId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("clients")
    .update({ logo_asset_id: null })
    .eq("id", clientId)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Couldn't remove this client's image");
}
