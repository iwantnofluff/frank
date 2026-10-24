// A Concept laid out for reading (direct instruction: not one big block).
// Nothing is stored differently; this only decides where the breaks fall:
// the writer's own line breaks are kept, each "Slide N:" (or "Story N:",
// "Frame N:") starts its own line with its label, and a long run of prose
// is split into short paragraphs at sentence ends.

export type ConceptBlock = { kind: "p"; text: string } | { kind: "slide"; label: string; text: string };

const SLIDE = /\b((?:Slide|Story|Frame|Scene)\s*\d+)\s*[:\-–—]\s*/gi;
// Prose longer than this is split at sentence ends, about this long each.
const LONG = 320;

function sentences(text: string): string[] {
  // Ends at . ! ? followed by a space and a capital or an opening quote or bracket.
  return text.split(/(?<=[.!?]["”’)]?)\s+(?=["“‘(]?[A-Z0-9])/).filter((s) => s.trim());
}

function paragraphs(text: string): string[] {
  const t = text.trim();
  if (t.length <= LONG) return t ? [t] : [];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences(t)) {
    if (cur && cur.length + s.length > LONG / 1.4) {
      out.push(cur.trim());
      cur = "";
    }
    cur += (cur ? " " : "") + s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function conceptBlocks(text: string): ConceptBlock[] {
  const out: ConceptBlock[] = [];
  for (const line of text.split(/\n+/)) {
    if (!line.trim()) continue;
    const parts = line.split(SLIDE);
    // split with one group: [before, label1, after1, label2, after2…]
    const before = parts[0];
    for (const p of paragraphs(before)) out.push({ kind: "p", text: p });
    for (let i = 1; i < parts.length; i += 2) {
      const label = parts[i].replace(/\s+/, " ").replace(/^\w/, (c) => c.toUpperCase());
      let body = (parts[i + 1] ?? "").trim();
      // "(the bird in the frame)": its words, not its brackets.
      if (body.startsWith("(") && body.endsWith(")")) body = body.slice(1, -1).trim();
      out.push({ kind: "slide", label, text: body });
    }
  }
  return out;
}
