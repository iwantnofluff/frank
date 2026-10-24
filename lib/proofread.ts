// Proofreading what's saved (phase121, direct instruction): suggestions,
// never changes, each with Fix and Ignore. Spelling, punctuation and
// grammar come from one AI request; paragraphs that run on with a single
// line break are found here, without AI.

export type ProofreadKind = "spelling" | "grammar" | "punctuation" | "paragraph";

export interface ProofreadSuggestion {
  id: string;
  // The field's key: a copy field ("caption", "alt"…), or a Production
  // one ("voiceover", "thumbnail_text", "slide_1"…).
  field: string;
  // The exact words in the field, and what they'd become.
  from: string;
  to: string;
  reason: string;
  kind: ProofreadKind;
}

// A short, stable id, so an Ignore sticks to the same suggestion.
function idOf(field: string, from: string, to: string) {
  let h = 0;
  for (const ch of `${field}\u0000${from}\u0000${to}`) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return `p${(h >>> 0).toString(36)}`;
}

// A line that starts a list item, a hashtag run or a sign-off is meant to
// sit under the one before.
const LISTY = /^\s*([-•*–]|\d+[.)]|#|@|—)/;

// Paragraphs on the very next line: a single break between two lines of
// prose, where a blank line would separate them. Only for the long fields
// (a caption, a VO), and never between list-like lines.
export function paragraphSuggestions(field: string, text: string): ProofreadSuggestion[] {
  const out: ProofreadSuggestion[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length - 1; i++) {
    const a = lines[i];
    const b = lines[i + 1];
    if (!a.trim() || !b.trim()) continue;
    if (LISTY.test(a) || LISTY.test(b)) continue;
    // Just the words either side of the break, so fixing a word nearby
    // doesn't lose it.
    const tail = a.match(/\S+\s*$/)?.[0] ?? a;
    const head = b.match(/^\s*\S+/)?.[0] ?? b;
    const from = `${tail}\n${head}`;
    const to = `${tail}\n\n${head}`;
    const starts = b.trim().split(/\s+/).slice(0, 3).join(" ");
    out.push({
      id: idOf(field, from, to),
      field,
      from,
      to,
      reason: `A new paragraph ("${starts}…") on the next line: add a blank line before it`,
      kind: "paragraph",
    });
  }
  return out;
}

export function buildProofreadPrompt(input: {
  fields: { key: string; label: string; text: string }[];
  clientName: string | null;
  toneOfVoice: string[];
}): string {
  return [
    "You proofread social media copy for a brand before it goes out. Find only clear mistakes: spelling and typos, grammar, and wrong or missing punctuation. Reply with one JSON object and nothing else.",
    "Respect deliberate style: a casual tone, sentence fragments, lowercase styling, slang, emojis, hashtags, @handles, brand and product names, line breaks and the spelling convention (British or American) the copy already uses. If you're not sure it's a mistake, leave it out.",
    input.clientName ? `The brand: ${input.clientName}.` : null,
    input.toneOfVoice.length ? `Its tone of voice (follow it; don't flag what it asks for):\n${input.toneOfVoice.map((t) => `- ${t}`).join("\n")}` : null,
    'Shape: {"suggestions":[{"field":"<key>","from":"<exact words from that field>","to":"<corrected words>","reason":"<a few words>","kind":"spelling|grammar|punctuation"}]}. "from" must appear in the field exactly as written, as short as it can be while appearing only once. Each suggestion one change. No suggestions: {"suggestions":[]}.',
    "The fields:",
    ...input.fields.map((f) => `<${f.key}> (${f.label})\n${f.text}\n</${f.key}>`),
  ]
    .filter(Boolean)
    .join("\n\n");
}

const KINDS = new Set(["spelling", "grammar", "punctuation"]);

// The reply's suggestions, kept only where they're real: a known field,
// words that are in it, and an actual change.
export function parseProofread(reply: string, fields: Record<string, string>): ProofreadSuggestion[] {
  const start = reply.indexOf("{");
  const end = reply.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return [];
  }
  const list = (raw as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(list)) return [];
  const out: ProofreadSuggestion[] = [];
  const seen = new Set<string>();
  for (const s of list as Record<string, unknown>[]) {
    const field = typeof s.field === "string" ? s.field : "";
    const from = typeof s.from === "string" ? s.from : "";
    const to = typeof s.to === "string" ? s.to : "";
    const kind = typeof s.kind === "string" && KINDS.has(s.kind) ? (s.kind as ProofreadKind) : "spelling";
    const text = fields[field];
    if (!text || !from || from === to || !text.includes(from)) continue;
    const id = idOf(field, from, to);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, field, from, to, reason: typeof s.reason === "string" ? s.reason.slice(0, 120) : "", kind });
  }
  return out;
}

// A suggestion applied to a field's words: its first occurrence.
export function applySuggestion(text: string, s: Pick<ProofreadSuggestion, "from" | "to">): string {
  const at = text.indexOf(s.from);
  return at < 0 ? text : text.slice(0, at) + s.to + text.slice(at + s.from.length);
}

// What's still worth showing: not ignored, and its words still there (once
// fixed, or changed by hand, a suggestion goes by itself).
export function openSuggestions(
  all: ProofreadSuggestion[],
  ignored: string[],
  current: Record<string, string>,
): ProofreadSuggestion[] {
  const skip = new Set(ignored);
  return all.filter((s) => !skip.has(s.id) && (current[s.field] ?? "").includes(s.from));
}
