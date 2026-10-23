// Notes for Designer, neatened for reading (direct instruction): a line
// that opens with a short label and a colon ("Layout:", "Type and
// placement:", "Guardrails:") shows the label as a heading and the rest
// under it; "-" or "•" lines are a list; the rest, paragraphs. Nothing is
// stored differently: notes typed by hand read the same way.

export type NoteBlock =
  | { kind: "head"; text: string }
  | { kind: "p"; text: string }
  | { kind: "list"; items: string[] };

// A heading: up to six words, starting with a capital, no full stop, URL
// or time in it ("Note: 10:30" or "https://…" stay as they are).
const LABEL = /^([A-Z][A-Za-z0-9&'’()/ -]{0,48}):(?:\s+(.*))?$/;
const BULLET = /^\s*[-•]\s+(.*)$/;

export function noteBlocks(text: string): NoteBlock[] {
  const out: NoteBlock[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = line.match(BULLET);
    if (bullet) {
      const last = out[out.length - 1];
      if (last?.kind === "list") last.items.push(bullet[1]);
      else out.push({ kind: "list", items: [bullet[1]] });
      continue;
    }
    const label = line.match(LABEL);
    if (label && label[1].trim().split(/\s+/).length <= 6) {
      out.push({ kind: "head", text: label[1].trim() });
      if (label[2]?.trim()) out.push({ kind: "p", text: label[2].trim() });
      continue;
    }
    out.push({ kind: "p", text: line });
  }
  return out;
}
