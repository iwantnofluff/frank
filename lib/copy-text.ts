// Copying a caption to paste into Instagram or another platform (direct
// instruction): its paragraphs and line breaks kept. Plain text with real
// line breaks (blank lines between paragraphs) for a plain caption box,
// and the same as HTML paragraphs for an editor that pastes rich text,
// which would otherwise run the lines together.

// Line endings made plain, trailing spaces off each line, no blank lines
// at either end; the blank lines between paragraphs stay.
export function tidyForPaste(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Paragraphs (split at blank lines) as <p>, single line breaks as <br>.
export function captionHtml(text: string): string {
  return tidyForPaste(text)
    .split(/\n{2,}/)
    .map((para) => `<p>${para.split("\n").map(escapeHtml).join("<br>")}</p>`)
    .join("");
}

export async function copyCaption(text: string): Promise<void> {
  const plain = tidyForPaste(text);
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([plain], { type: "text/plain" }),
          "text/html": new Blob([captionHtml(plain)], { type: "text/html" }),
        }),
      ]);
      return;
    } catch {
      // Some browsers refuse rich text; plain text keeps the breaks.
    }
  }
  await navigator.clipboard.writeText(plain);
}
