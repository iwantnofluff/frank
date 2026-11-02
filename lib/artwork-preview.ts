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

// A smaller copy again, for the small places: a project table's Creative
// cell and the feed grids (decided directly, 2 Nov 2026: a 1080px image in
// a cell a few dozen pixels wide was most of a table's download). Saved
// at upload beside the other copy, `${storage_key}.thumb`; shown wherever
// it exists, else the lighter copy, else the original — so anything
// uploaded before it shows as it did.
export const THUMB_SUFFIX = ".thumb";
// A feed tile's width on a high-density screen; the table's cell is smaller.
export const THUMB_WIDTH = 400;

export function thumbKey(storageKey: string): string {
  return `${storageKey}${THUMB_SUFFIX}`;
}

// Every original and its copies, for removing files (removing a copy that
// doesn't exist is harmless).
export function withPreviews(paths: string[]): string[] {
  return paths.flatMap((p) => [p, previewKey(p), thumbKey(p)]);
}

// A copy's name, not an original's: for counting the files a removal took.
export function isCopy(name: string): boolean {
  return name.endsWith(PREVIEW_SUFFIX) || name.endsWith(THUMB_SUFFIX);
}

// Images that get a copy: not GIFs (it would stop moving) or SVGs.
export function takesPreview(mimeType: string): boolean {
  return mimeType.startsWith("image/") && mimeType !== "image/gif" && mimeType !== "image/svg+xml";
}

// The copy, in the browser: at most PREVIEW_WIDTH wide. A JPEG stays JPEG;
// anything else (it may be transparent) WebP, or JPEG on white where the
// browser can't make WebP. Null when it wouldn't be any lighter.
export function makePreview(file: File): Promise<Blob | null> {
  return makeCopy(file, PREVIEW_WIDTH, 400_000);
}

// The small copy, made the same way at most THUMB_WIDTH wide.
export function makeThumb(file: File): Promise<Blob | null> {
  return makeCopy(file, THUMB_WIDTH, 60_000);
}

// Null when the image is already that small (no wider, and under
// smallBytes) or a copy wouldn't be any lighter.
async function makeCopy(file: File, maxWidth: number, smallBytes: number): Promise<Blob | null> {
  if (!takesPreview(file.type)) return null;
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width <= maxWidth && file.size < smallBytes) return null;
    const width = Math.min(maxWidth, bitmap.width);
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
