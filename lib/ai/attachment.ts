// A file-kind Reference Material / Knowledge entry, sent to the model
// alongside the text prompt rather than as a text note — a PDF has no
// "body" to fold into a bullet list. PDF only for now: Claude's Messages
// API reads a PDF natively (Base64PDFSource, no text extraction needed),
// which is what actually made this worth building — a DOCX/XLSX/image
// knowledge upload would need real extraction or a vision call, neither
// of which exists yet, so those kinds still contribute nothing (same as
// before this feature, not a regression from it).
//
// Images too, since "Write with Claude" (phase52): Claude reads them as
// image blocks. Other providers ignore attachments.
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

export interface Attachment {
  base64: string;
  mediaType: "application/pdf" | ImageType;
  title: string;
}

// The provider reads at most 600 PDF pages in one request (seen on live:
// "A maximum of 600 PDF pages may be provided"). Frank sends up to 550
// (decided directly), the shortest first so the most files fit; the rest
// are skipped, and named as skipped where the caller says so.
export const MAX_PDF_PAGES = 550;

// A PDF's page count from its bytes: its page objects (/Type /Page), or
// where those are packed out of sight, its page tree's /Count; failing
// both, an estimate from its size (about 30KB a page) that errs high.
export function pdfPageCount(bytes: Uint8Array): number {
  const text = Buffer.from(bytes).toString("latin1");
  const pages = (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
  if (pages > 0) return pages;
  const tree = [...text.matchAll(/\/Type\s*\/Pages[\s\S]{0,200}?\/Count\s+(\d+)|\/Count\s+(\d+)[\s\S]{0,200}?\/Type\s*\/Pages/g)]
    .map((m) => Number(m[1] ?? m[2]))
    .filter((n) => n > 0);
  if (tree.length) return Math.max(...tree);
  return Math.max(1, Math.ceil(bytes.length / 30_000));
}

// Which of these files fit the page budget: images always; PDFs shortest
// first until the next would go over.
export function withinPdfPageBudget<T extends { mediaType: string; bytes: Uint8Array }>(
  files: T[],
  budget = MAX_PDF_PAGES,
): { kept: T[]; skipped: T[] } {
  const pdfs = files
    .filter((f) => f.mediaType === "application/pdf")
    .map((f) => ({ f, pages: pdfPageCount(f.bytes) }))
    .sort((a, b) => a.pages - b.pages);
  const over = new Set<T>();
  let total = 0;
  for (const { f, pages } of pdfs) {
    if (total + pages > budget) over.add(f);
    else total += pages;
  }
  return { kept: files.filter((f) => !over.has(f)), skipped: files.filter((f) => over.has(f)) };
}
