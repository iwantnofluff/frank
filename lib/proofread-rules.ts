// The workspace's proofreading rules (phase122, direct instruction):
// Settings → Knowledge → Proofreading switches each built-in rule on or
// off and adds the workspace's own. Built-ins live here; the table keeps a
// row for one only once it's been changed, so every built-in is on until
// someone switches it off. Rules marked ai go into the one proofreading
// request; the rest are checked here, exactly, without AI.

import type { ProofreadKind, ProofreadSuggestion } from "@/lib/proofread";

export type SpellingConvention = "follow" | "british" | "american";

export interface BuiltinRule {
  key: string;
  title: string;
  description: string;
  group: "Language" | "Layout" | "Style";
  ai: boolean;
}

export const BUILTIN_RULES: BuiltinRule[] = [
  { key: "spelling", title: "Spelling and typos", description: "Words spelled wrong, and slips of the keyboard.", group: "Language", ai: true },
  { key: "grammar", title: "Grammar", description: "Sentences that don't hold together: agreement, tense, missing words.", group: "Language", ai: true },
  { key: "punctuation", title: "Punctuation", description: "Wrong or missing commas, full stops, apostrophes and quotes.", group: "Language", ai: true },
  {
    key: "convention",
    title: "British or American spelling",
    description: "Keeps to one way of spelling: colour or color, organise or organize.",
    group: "Language",
    ai: true,
  },
  {
    key: "names",
    title: "Names as the brand writes them",
    description: "Brand, product and people's names, spelled and capitalised as in the client's Knowledge (About, Products and Services, Protected Terms).",
    group: "Language",
    ai: true,
  },
  {
    key: "capitals",
    title: "Capital letters",
    description: "A capital at the start of each sentence and line. Switch off for a brand that writes in lowercase.",
    group: "Language",
    ai: false,
  },
  { key: "paragraphs", title: "Paragraph spacing", description: "A blank line between paragraphs, in captions and VOs.", group: "Layout", ai: false },
  {
    key: "spacing",
    title: "Spaces",
    description: "Double spaces, a space before punctuation, and a missing space after a comma or full stop.",
    group: "Layout",
    ai: false,
  },
  { key: "repeats", title: "Repeated words", description: "The same word twice in a row, as in \"the the\".", group: "Layout", ai: false },
  {
    key: "hashtags",
    title: "Hashtags",
    description: "The same hashtag twice, a hyphen that cuts a hashtag short, and one split by a space.",
    group: "Layout",
    ai: true,
  },
  { key: "no_em_dash", title: "No em dashes", description: "Each em dash (—) rewritten with a comma, full stop or brackets.", group: "Style", ai: true },
  { key: "no_colons", title: "No colons", description: "Each colon rewritten out, except in times (10:30), ratios and links.", group: "Style", ai: true },
  {
    key: "ai_phrases",
    title: "No AI-sounding phrases",
    description: "Phrases that read as written by AI, each with a plainer rewrite. Edit the list to suit.",
    group: "Style",
    ai: true,
  },
];

export const BUILTIN_GROUPS = ["Language", "Layout", "Style"] as const;

// The phrases the AI-sounding rule starts with; the workspace edits them.
export const DEFAULT_AI_PHRASES = [
  "delve",
  "elevate your",
  "unlock the",
  "unleash",
  "game-changer",
  "seamless",
  "embark on",
  "tapestry",
  "a testament to",
  "in today's fast-paced world",
  "in today's digital age",
  "look no further",
  "take it to the next level",
  "harness the power",
  "dive into",
  "in the realm of",
  "ever-evolving",
  "cutting-edge",
  "revolutionise",
  "nestled",
  "boasts",
  "whether you're",
  "it's not just",
  "say goodbye to",
  "imagine a world",
  "here's the thing",
  "level up",
];

export interface ProofreadRuleRow {
  id: string;
  kind: "builtin" | "instruction" | "word";
  rule_key: string | null;
  body: string | null;
  from_word: string | null;
  to_word: string | null;
  enabled: boolean;
  options: Record<string, unknown> | null;
  created_at: string;
}

export interface ResolvedRules {
  on: (key: string) => boolean;
  convention: SpellingConvention;
  phrases: string[];
  instructions: { id: string; body: string }[];
  words: { from: string; to: string }[];
}

// The workspace's rows over the defaults.
export function resolveRules(rows: ProofreadRuleRow[]): ResolvedRules {
  const byKey = new Map(rows.filter((r) => r.kind === "builtin" && r.rule_key).map((r) => [r.rule_key!, r]));
  const opt = (key: string, name: string) => (byKey.get(key)?.options ?? {})[name];
  const convention = opt("convention", "convention");
  const phrases = opt("ai_phrases", "phrases");
  const byAge = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return {
    on: (key) => byKey.get(key)?.enabled ?? true,
    convention: convention === "british" || convention === "american" ? convention : "follow",
    phrases: Array.isArray(phrases) ? phrases.filter((p): p is string => typeof p === "string" && !!p.trim()) : DEFAULT_AI_PHRASES,
    instructions: byAge.filter((r) => r.kind === "instruction" && r.enabled && r.body?.trim()).map((r) => ({ id: r.id, body: r.body!.trim() })),
    words: byAge
      .filter((r) => r.kind === "word" && r.enabled && r.from_word?.trim() && r.to_word !== null)
      .map((r) => ({ from: r.from_word!.trim(), to: r.to_word!.trim() })),
  };
}

// The rules for the AI request, each with the id its suggestions carry.
export interface AiRule {
  id: string;
  text: string;
  kind: ProofreadKind;
  // Shown as a suggestion's reason when the AI gives none.
  label: string;
}

export function aiRules(rules: ResolvedRules, names: string[]): AiRule[] {
  const out: AiRule[] = [];
  const add = (key: string, text: string, kind: ProofreadKind, label: string) => {
    if (rules.on(key)) out.push({ id: key, text, kind, label });
  };
  add("spelling", "Spelling and typos. Flag only clear mistakes.", "spelling", "Spelling");
  add("grammar", "Grammar. Flag only clear mistakes.", "grammar", "Grammar");
  add("punctuation", "Wrong or missing punctuation. Flag only clear mistakes.", "punctuation", "Punctuation");
  add(
    "convention",
    rules.convention === "british"
      ? "British spelling throughout (colour, organise, centre, travelled): flag each American spelling."
      : rules.convention === "american"
        ? "American spelling throughout (color, organize, center, traveled): flag each British spelling."
        : "One spelling convention: where British and American spellings are mixed, flag the ones that differ from what most of the copy uses.",
    "spelling",
    "Spelling convention",
  );
  add(
    "names",
    names.length
      ? `Names written exactly as the brand writes them, capitals included. Its names and terms:\n${names.map((n) => `- ${n}`).join("\n")}`
      : "The brand's own name written exactly as the brand writes it, capitals included.",
    "spelling",
    "Name as the brand writes it",
  );
  add("hashtags", "A hashtag split by a space where it's clearly meant as one (#summer sale): join it up.", "hashtag", "Hashtag");
  add(
    "no_em_dash",
    "No em dashes (—) and no spaced en dashes ( – ). For each one, rewrite the words around it with a comma, a full stop or brackets, whichever reads best.",
    "style",
    "No em dashes",
  );
  add(
    "no_colons",
    "No colons, except in times (10:30), ratios (16:9) and links. For each one, rewrite the words around it without it.",
    "style",
    "No colons",
  );
  if (rules.phrases.length)
    add(
      "ai_phrases",
      `Phrases that sound written by AI: rewrite each in plainer words. These, and others plainly like them:\n${rules.phrases.map((p) => `- ${p}`).join("\n")}`,
      "style",
      "Sounds like AI",
    );
  rules.instructions.forEach((r, i) => out.push({ id: `own_${i + 1}`, text: r.body, kind: "custom", label: r.body.slice(0, 80) }));
  return out;
}

// The same rules, for Draft with Frank to write by (direct instruction:
// drafts follow the workspace's rules, so the proofread has less to flag).
// Only what changes how copy is written; spelling, grammar and spaces go
// without saying.
export function writingRules(rules: ResolvedRules): string[] {
  const out: (string | null)[] = [
    rules.on("convention") && rules.convention === "british" ? "British spelling throughout (colour, organise, centre, travelled)." : null,
    rules.on("convention") && rules.convention === "american" ? "American spelling throughout (color, organize, center, traveled)." : null,
    rules.on("names") ? "The brand's names exactly as its knowledge writes them, capitals included." : null,
    rules.on("paragraphs") ? "A blank line between paragraphs in the caption and the VO." : null,
    rules.on("hashtags") ? "Each hashtag one unbroken word, with no hyphen, and none repeated." : null,
    rules.on("no_em_dash") ? "No em dashes (—) and no spaced en dashes ( – ): use a comma, a full stop or brackets." : null,
    rules.on("no_colons") ? "No colons, except in times (10:30), ratios and links." : null,
    rules.on("ai_phrases") && rules.phrases.length
      ? `Nothing that sounds written by AI. Avoid these, and others like them: ${rules.phrases.join(", ")}.`
      : null,
    ...rules.instructions.map((r) => r.body),
    ...rules.words.map((w) => (w.to ? `Write "${w.from}" as "${w.to}".` : `Never write "${w.from}".`)),
  ];
  return out.filter((r): r is string => !!r);
}

// ---- The checks done here, without AI ----

function idOf(field: string, from: string, to: string) {
  let h = 0;
  for (const ch of `${field}\u0000${from}\u0000${to}`) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return `p${(h >>> 0).toString(36)}`;
}

// The words from start to end, widened a word at a time to the left until
// they're found first at that very place, as a Fix puts its words in at
// the first place they're found. Null if that can't be done.
function placed(text: string, start: number, end: number): { from: string; at: number } | null {
  let s = start;
  for (let i = 0; i < 12; i++) {
    const from = text.slice(s, end);
    if (text.indexOf(from) === s) return { from, at: s };
    if (s === 0) return null;
    // Back over the space before, then the word before that.
    let j = s;
    while (j > 0 && /\s/.test(text[j - 1])) j--;
    while (j > 0 && !/\s/.test(text[j - 1])) j--;
    s = j;
  }
  return null;
}

function make(
  field: string,
  text: string,
  start: number,
  end: number,
  replacement: string,
  reason: string,
  kind: ProofreadKind,
): ProofreadSuggestion | null {
  const p = placed(text, start, end);
  if (!p) return null;
  // The widened words keep what was added before the change.
  const to = text.slice(p.at, start) + replacement;
  if (p.from === to) return null;
  return { id: idOf(field, p.from, to), field, from: p.from, to, reason, kind, exact: true };
}

export function spacingSuggestions(field: string, text: string): ProofreadSuggestion[] {
  const out: (ProofreadSuggestion | null)[] = [];
  // Two or more spaces between words (not at a line's start, and not
  // before punctuation, which the next check fixes in one go).
  for (const m of text.matchAll(/(\S)( {2,})(?=[^\s,.!?;:])/g)) {
    const at = m.index! + 1;
    out.push(make(field, text, at - 1, at + m[2].length + 1, `${m[1]} ${text[at + m[2].length]}`, "Two spaces where one will do", "spacing"));
  }
  // A space before punctuation that ends a word.
  for (const m of text.matchAll(/(\S) +([,.!?;:])(?=\s|$)/g)) {
    if (m[1] === m[2]) continue;
    out.push(make(field, text, m.index!, m.index! + m[0].length, `${m[1]}${m[2]}`, `No space before the ${m[2] === "," ? "comma" : "punctuation"}`, "spacing"));
  }
  // No space after a comma, or after a full stop, ? or ! ending a sentence.
  for (const m of text.matchAll(/(\p{L}{2,}),(\p{L}{2,})/gu)) {
    out.push(make(field, text, m.index!, m.index! + m[0].length, `${m[1]}, ${m[2]}`, "A space after the comma", "spacing"));
  }
  for (const m of text.matchAll(/(\p{Ll}{2,})([.!?])(\p{Lu}\p{Ll}+)/gu)) {
    out.push(make(field, text, m.index!, m.index! + m[0].length, `${m[1]}${m[2]} ${m[3]}`, "A space after the full stop", "spacing"));
  }
  return out.filter((s): s is ProofreadSuggestion => !!s);
}

// Words some people mean to say twice.
const MEANT_TWICE = new Set(["bye", "so", "no", "yes", "ha", "haha", "ho", "hey", "go", "la", "na", "blah", "ding", "knock", "tick", "very", "more", "really", "well", "now", "wow", "yum", "boo", "chop", "bling", "tut", "that", "had"]);

export function repeatSuggestions(field: string, text: string): ProofreadSuggestion[] {
  const out: (ProofreadSuggestion | null)[] = [];
  for (const m of text.matchAll(/(?<![#@\p{L}\p{N}])(\p{L}+)[ \t]+\1(?![\p{L}\p{N}])/giu)) {
    if (MEANT_TWICE.has(m[1].toLowerCase())) continue;
    out.push(make(field, text, m.index!, m.index! + m[0].length, m[1], `"${m[1]}" twice in a row`, "repeat"));
  }
  return out.filter((s): s is ProofreadSuggestion => !!s);
}

export function hashtagSuggestions(field: string, text: string): ProofreadSuggestion[] {
  const out: (ProofreadSuggestion | null)[] = [];
  // A hyphen ends a hashtag: #summer-sale only tags #summer.
  for (const m of text.matchAll(/#[\p{L}\p{N}_]+(?:-[\p{L}\p{N}_]+)+/gu)) {
    out.push(make(field, text, m.index!, m.index! + m[0].length, m[0].replace(/-/g, ""), `A hashtag stops at a hyphen: this one only tags ${m[0].split("-")[0]}`, "hashtag"));
  }
  // The same hashtag again: the later one goes, with the space before it.
  const seen = new Set<string>();
  for (const m of text.matchAll(/(?<![\p{L}\p{N}_&])#[\p{L}\p{N}_]+/gu)) {
    const tag = m[0].toLowerCase();
    if (!seen.has(tag)) {
      seen.add(tag);
      continue;
    }
    let start = m.index!;
    while (start > 0 && /[ \t]/.test(text[start - 1])) start--;
    out.push(make(field, text, start, m.index! + m[0].length, "", `${m[0]} is already in it`, "hashtag"));
  }
  return out.filter((s): s is ProofreadSuggestion => !!s);
}

// Short words a full stop doesn't end a sentence after.
const ABBREVIATION = /(?:^|[\s(])(?:e\.g|i\.e|etc|vs|approx|incl|no|mr|mrs|ms|dr|st|vol|fig)\.$/i;

// A sentence's first letter in capitals: at the field's start, a line's
// start, and after a full stop, ? or ! and a space. Not after an
// abbreviation or a trailing-off "...", and never a word with capitals of
// its own (iPhone, eBay).
export function capitalSuggestions(field: string, text: string): ProofreadSuggestion[] {
  const out: (ProofreadSuggestion | null)[] = [];
  for (const m of text.matchAll(/(^|[.!?]["'’)\]]?[ \t]+|\n[ \t]*)(\p{Ll}[\p{L}\p{N}'’-]*)/gu)) {
    const start = m.index! + m[1].length;
    const word = m[2];
    if (/\p{Lu}/u.test(word)) continue;
    const before = text.slice(0, m.index! + 1);
    if (m[1].startsWith(".") && (ABBREVIATION.test(before) || /(\.\.|…)$/.test(before))) continue;
    out.push(make(field, text, start, start + word.length, capital(word), "A capital to start the sentence", "capital"));
  }
  return out.filter((s): s is ProofreadSuggestion => !!s);
}

// Where a suggestion changes the words: from its first difference to its
// last, as places in the text (empty for an insertion). Null if its words
// aren't there.
function changedSpan(text: string, s: ProofreadSuggestion): [number, number] | null {
  const at = text.indexOf(s.from);
  if (at < 0) return null;
  let head = 0;
  while (head < s.from.length && head < s.to.length && s.from[head] === s.to[head]) head++;
  let tail = 0;
  while (tail < s.from.length - head && tail < s.to.length - head && s.from[s.from.length - 1 - tail] === s.to[s.to.length - 1 - tail]) tail++;
  return [at + head, at + s.from.length - tail];
}

// Whether the AI's suggestions already cover the character at `at`.
function covered(text: string, at: number, ai: ProofreadSuggestion[]) {
  return ai.some((s) => {
    const i = text.indexOf(s.from);
    return i >= 0 && i <= at && at < i + s.from.length;
  });
}

const capital = (w: string) => w.charAt(0).toLocaleUpperCase() + w.slice(1);

// Em dashes and colons the AI left: a plain fix, so none get through.
export function dashSuggestions(field: string, text: string, ai: ProofreadSuggestion[]): ProofreadSuggestion[] {
  const out: (ProofreadSuggestion | null)[] = [];
  for (const m of text.matchAll(/(\S+)([ \t]*—[ \t]*|[ \t]+–[ \t]+)(\S+)/g)) {
    const dash = m.index! + m[1].length + m[2].search(/[—–]/);
    if (covered(text, dash, ai)) continue;
    const join = /[,.!?;:)]$/.test(m[1]) ? " " : ", ";
    out.push(make(field, text, m.index!, m.index! + m[0].length, `${m[1]}${join}${m[3]}`, "No em dashes", "style"));
  }
  return out.filter((s): s is ProofreadSuggestion => !!s);
}

export function colonSuggestions(field: string, text: string, ai: ProofreadSuggestion[]): ProofreadSuggestion[] {
  const out: (ProofreadSuggestion | null)[] = [];
  // A colon after a word and before a space or line break: not a time, a
  // ratio, a link or a smiley.
  for (const m of text.matchAll(/(\S*\p{L}):(\s+)(\S+)/gu)) {
    if (/^https?$/i.test(m[1])) continue;
    const colon = m.index! + m[1].length;
    if (covered(text, colon, ai)) continue;
    out.push(make(field, text, m.index!, m.index! + m[0].length, `${m[1]}.${m[2]}${capital(m[3])}`, "No colons", "style"));
  }
  return out.filter((s): s is ProofreadSuggestion => !!s);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The workspace's preferred words: always write `from` as `to`.
export function wordSuggestions(field: string, text: string, words: { from: string; to: string }[]): ProofreadSuggestion[] {
  const out: (ProofreadSuggestion | null)[] = [];
  for (const w of words) {
    // Only capitals differ (Linkedin → LinkedIn): match whatever the case.
    const onlyCase = w.from.toLowerCase() === w.to.toLowerCase();
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(w.from)}(?![\\p{L}\\p{N}])`, "giu");
    for (const m of text.matchAll(re)) {
      let to = w.to;
      if (onlyCase) {
        if (m[0] === w.to) continue;
      } else if (/^\p{Lu}/u.test(m[0]) && /^\p{Ll}/u.test(to)) {
        // At a sentence's start, keep the capital.
        to = capital(to);
      }
      out.push(make(field, text, m.index!, m.index! + m[0].length, to, w.to ? `Write "${w.from}" as "${w.to}"` : `Leave out "${w.from}"`, "word"));
    }
  }
  return out.filter((s): s is ProofreadSuggestion => !!s);
}

// Everything checked without AI, for one field, after the AI's
// suggestions for it are in.
export function codeSuggestions(
  field: string,
  text: string,
  rules: ResolvedRules,
  prose: boolean,
  ai: ProofreadSuggestion[],
  paragraphs: (field: string, text: string) => ProofreadSuggestion[],
): ProofreadSuggestion[] {
  const mine = ai.filter((s) => s.field === field);
  // Spaces and repeats the AI already fixed in its own words show once:
  // only where the AI's words take in the very thing this changes, never
  // just because it's fixing the word beside it.
  const overlaps = (s: ProofreadSuggestion) => {
    const span = changedSpan(text, s);
    if (!span) return false;
    const [from, to] = [span[0], Math.max(span[1], span[0] + 1)];
    return mine.some((a) => {
      const i = text.indexOf(a.from);
      return i >= 0 && i < to && from < i + a.from.length;
    });
  };
  const exact = [
    ...(rules.on("capitals") ? capitalSuggestions(field, text) : []),
    ...(prose && rules.on("paragraphs") ? paragraphs(field, text) : []),
    ...(rules.on("spacing") ? spacingSuggestions(field, text) : []),
    ...(rules.on("repeats") ? repeatSuggestions(field, text) : []),
    ...(rules.on("hashtags") ? hashtagSuggestions(field, text) : []),
    ...(rules.on("no_em_dash") ? dashSuggestions(field, text, mine) : []),
    ...(rules.on("no_colons") ? colonSuggestions(field, text, mine) : []),
    ...wordSuggestions(field, text, rules.words),
  ];
  return exact.filter((s) => !((s.kind === "spacing" || s.kind === "repeat") && overlaps(s)));
}

// A field's suggestions: the AI's that still apply, and the exact checks
// worked out from its words as they are now. Where the AI is fixing a
// sentence's first word, its fix takes the capital (tsis → This), not a
// second suggestion for the same word. The server keeps these with the
// version; the editor works the exact ones out again as the words change.
export function proofreadField(
  field: string,
  text: string,
  rules: ResolvedRules,
  ai: ProofreadSuggestion[],
  paragraphs: (field: string, text: string) => ProofreadSuggestion[],
  prose: (field: string) => boolean,
): ProofreadSuggestion[] {
  const mine = ai.filter((s) => s.field === field && text.includes(s.from));
  const exact = codeSuggestions(field, text, rules, prose(field), mine, paragraphs);
  const merged = new Set<string>();
  const fixed = mine.map((a) => {
    const at = text.indexOf(a.from);
    const cap = exact.find((c) => c.kind === "capital" && changedSpan(text, c)?.[0] === at);
    if (!cap) return a;
    // Whether or not its fix already has the capital (the server's does).
    merged.add(cap.id);
    return /^\p{Ll}/u.test(a.to) ? { ...a, to: capital(a.to) } : a;
  });
  return [...fixed, ...exact.filter((c) => !merged.has(c.id))];
}

// What the exact checks cover, so the AI leaves it out.
export function checkedApart(rules: ResolvedRules): string[] {
  return [
    rules.on("capitals") ? "a capital letter to start a sentence or a line" : null,
    rules.on("spacing") ? "double spaces and spaces around punctuation" : null,
    rules.on("repeats") ? "a word repeated" : null,
    rules.on("hashtags") ? "a hashtag repeated, or cut short by a hyphen" : null,
    rules.on("paragraphs") ? "paragraph breaks" : null,
  ].filter((x): x is string => !!x);
}
