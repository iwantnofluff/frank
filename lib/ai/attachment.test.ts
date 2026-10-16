// Run with: node --experimental-strip-types --test lib/ai/attachment.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_PDF_PAGES, pdfPageCount, withinPdfPageBudget } from "./attachment.ts";

// A stand-in PDF with this many page objects, its tree and an outline whose
// /Count isn't pages.
const pdf = (pages: number) =>
  new TextEncoder().encode(
    `%PDF-1.7\n1 0 obj << /Type /Pages /Count ${pages} >> endobj\n` +
      Array.from({ length: pages }, (_, i) => `${i + 2} 0 obj << /Type /Page /Parent 1 0 R >> endobj\n`).join("") +
      `99 0 obj << /Type /Outlines /Count 999 >> endobj\n%%EOF`,
  );

test("pdfPageCount: its page objects, not an outline's /Count", () => {
  assert.equal(pdfPageCount(pdf(28)), 28);
  assert.equal(pdfPageCount(pdf(1)), 1);
});

test("pdfPageCount: the page tree's /Count where the pages are packed away, else an estimate that errs high", () => {
  const packed = new TextEncoder().encode("%PDF-1.7\n1 0 obj << /Type /Pages /Kids [] /Count 240 >> endobj\n%%EOF");
  assert.equal(pdfPageCount(packed), 240);
  const opaque = new Uint8Array(300_000);
  assert.equal(pdfPageCount(opaque), 10);
});

test("withinPdfPageBudget: the shortest first, until the next would go over; images always", () => {
  // As on live (reported directly): four guides and two books.
  const files = [
    { title: "Kahneman", mediaType: "application/pdf", bytes: pdf(538) },
    { title: "Cialdini", mediaType: "application/pdf", bytes: pdf(18) },
    { title: "Persuasive", mediaType: "application/pdf", bytes: pdf(247) },
    { title: "Biases", mediaType: "application/pdf", bytes: pdf(28) },
    { title: "Cashvertising", mediaType: "application/pdf", bytes: pdf(35) },
    { title: "Moodboard", mediaType: "image/png", bytes: new Uint8Array(10) },
  ];
  const { kept, skipped } = withinPdfPageBudget(files);
  assert.deepEqual(kept.map((f) => f.title), ["Cialdini", "Persuasive", "Biases", "Cashvertising", "Moodboard"]);
  assert.deepEqual(skipped.map((f) => f.title), ["Kahneman"]);
  assert.equal(MAX_PDF_PAGES, 550);
  // One book alone fits.
  assert.deepEqual(withinPdfPageBudget([files[0]]).kept.map((f) => f.title), ["Kahneman"]);
});
