// A carousel's slides from one PDF (direct instruction): each page drawn
// as an image in the browser, in order, to fill the slides. PDF.js is
// loaded only when a PDF is dropped, so nothing else pays for it.

// Drawn this wide (LinkedIn's and Instagram's 1080, with room for a
// sharp screen), as JPEG: a page of flat colour and text stays small.
const PAGE_WIDTH = 2160;
const QUALITY = 0.9;

export function isPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export type PdfPages = { ok: true; files: File[] } | { ok: false; pages: number };

// The pages as image files, or, with more than `max` pages, how many it
// has (nothing drawn). Throws when the file can't be read as a PDF.
export async function pdfPageImages(file: File, max: number): Promise<PdfPages> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  try {
    const doc = await task.promise;
    if (doc.numPages > max) return { ok: false, pages: doc.numPages };
    const base = file.name.replace(/\.pdf$/i, "");
    const files: File[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: PAGE_WIDTH / page.getViewport({ scale: 1 }).width });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const context = canvas.getContext("2d")!;
      // A page with no background of its own is white, as in a viewer.
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(`Page ${n} couldn't be drawn.`))), "image/jpeg", QUALITY),
      );
      files.push(new File([blob], `${base}-page-${n}.jpg`, { type: "image/jpeg" }));
      page.cleanup();
    }
    return { ok: true, files };
  } finally {
    // The document and its worker, let go.
    await task.destroy();
  }
}
