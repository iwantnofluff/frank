// A lighter copy of each uploaded image, for showing in the phone (direct
// instruction: a 7MB original made the artwork load well after the page).
// Saved beside the original at upload, named after it, so no database
// change: `${storage_key}.preview`. Shown wherever it exists; anything
// uploaded before it, or that it couldn't be made for, shows the original.
// The original stays as it was, for downloads and anything at full size.
export const PREVIEW_SUFFIX = ".preview";
// As wide as the phone ever draws it on a high-density screen.
export const PREVIEW_WIDTH = 1080;

export function previewKey(storageKey: string): string {
  return `${storageKey}${PREVIEW_SUFFIX}`;
}

// Every original and its copy, for removing files (removing a copy that
// doesn't exist is harmless).
export function withPreviews(paths: string[]): string[] {
  return paths.flatMap((p) => [p, previewKey(p)]);
}

// Images that get a copy: not GIFs (it would stop moving) or SVGs.
export function takesPreview(mimeType: string): boolean {
  return mimeType.startsWith("image/") && mimeType !== "image/gif" && mimeType !== "image/svg+xml";
}

// The copy, in the browser: at most PREVIEW_WIDTH wide. A JPEG stays JPEG;
// anything else (it may be transparent) WebP, or JPEG on white where the
// browser can't make WebP. Null when it wouldn't be any lighter.
export async function makePreview(file: File): Promise<Blob | null> {
  if (!takesPreview(file.type)) return null;
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width <= PREVIEW_WIDTH && file.size < 400_000) return null;
    const width = Math.min(PREVIEW_WIDTH, bitmap.width);
    const height = Math.round((bitmap.height * width) / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const g = canvas.getContext("2d");
    if (!g) return null;
    const encode = (type: string) => new Promise<Blob | null>((done) => canvas.toBlob(done, type, 0.82));
    if (file.type !== "image/jpeg") {
      g.drawImage(bitmap, 0, 0, width, height);
      const webp = await encode("image/webp");
      if (webp?.type === "image/webp") return webp.size < file.size ? webp : null;
    }
    g.fillStyle = "#fff";
    g.fillRect(0, 0, width, height);
    g.drawImage(bitmap, 0, 0, width, height);
    const jpeg = await encode("image/jpeg");
    return jpeg && jpeg.size < file.size ? jpeg : null;
  } finally {
    bitmap.close();
  }
}
