// Limits match spec section 10 / 28 exactly — not new numbers, the ones
// already documented for this product.
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/quicktime"]; // MOV reports as quicktime
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;

export function validateUploadFile(
  file: File,
): { ok: true } | { ok: false; message: string } {
  const isImage = ACCEPTED_IMAGE_TYPES.includes(file.type);
  const isVideo = ACCEPTED_VIDEO_TYPES.includes(file.type);

  if (!isImage && !isVideo) {
    return {
      ok: false,
      message: "Accepted formats: JPG, PNG, WebP, GIF, MP4, MOV.",
    };
  }

  const limit = isImage ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (file.size > limit) {
    const limitMb = Math.round(limit / (1024 * 1024));
    return {
      ok: false,
      message: `${isImage ? "Images" : "Videos"} must be ${limitMb}MB or smaller.`,
    };
  }

  return { ok: true };
}

export function isVideoFile(file: File) {
  return ACCEPTED_VIDEO_TYPES.includes(file.type);
}

export const ACCEPTED_FILE_EXTENSIONS =
  ".jpg,.jpeg,.png,.webp,.gif,.mp4,.mov";
