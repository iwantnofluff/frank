import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImageType } from "./attachment";
import { previewKey } from "@/lib/artwork-preview";

// The provider's own limit for one image. The lighter copy made at upload
// is well under it.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// What the bytes are, whatever the file was saved as.
export function sniffImage(bytes: Uint8Array): ImageType | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return "image/gif";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

// An uploaded image's lighter copy, else the original if small enough, read
// as the caller (storage's own RLS applies); null when neither can be read
// as an image.
export async function loadArtworkImage(
  supabase: SupabaseClient,
  storageKey: string,
): Promise<{ bytes: Uint8Array; mediaType: ImageType } | null> {
  for (const key of [previewKey(storageKey), storageKey]) {
    const { data } = await supabase.storage.from("assets").download(key);
    if (data && data.size <= MAX_IMAGE_BYTES) {
      const bytes = new Uint8Array(await data.arrayBuffer());
      const mediaType = sniffImage(bytes);
      return mediaType ? { bytes, mediaType } : null;
    }
  }
  return null;
}
