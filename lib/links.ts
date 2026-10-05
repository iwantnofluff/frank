// A reference as typed ("example.com/post" or a full address) as a link
// that opens (phase58). Anything with its own scheme is kept; the rest
// gets https://. Blank or space-filled text isn't a link.
export function linkHref(text: string): string | null {
  const t = text.trim();
  if (!t || /\s/.test(t)) return null;
  return /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
}

// The references to keep: trimmed, blanks dropped, each once.
export function tidyReferences(list: string[]): string[] {
  return [...new Set(list.map((t) => t.trim()).filter(Boolean))];
}
