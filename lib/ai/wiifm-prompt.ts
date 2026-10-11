// The post's WIIFM Direction, rewritten from its copy every time a copy
// version is saved (app/api/ai/wiifm-note/route.ts). Direct instruction:
// only what's working in the copy, named as the psychology principle or
// bias it uses, in short, concise bullets; never what isn't working.
// Pure, so the wording and the reading-back can be tested.

export const WIIFM_MAX_NOTES = 5;

export function buildWiifmPrompt(concept: string | null, copyText: string): string {
  return [
    "You look at the copy for one social or ad post and say what's working in it for the reader: the psychology principles and cognitive biases it uses well (for example loss aversion, social proof, curiosity gap, reciprocity, authority, scarcity, the endowment effect, specificity, concreteness).",
    concept ? `The brief's concept: ${concept}` : null,
    `The copy:\n${copyText}`,
    "",
    "Write 3 to 5 bullets, one per line, each in the form \"Principle: the words in the copy that use it, and what that does for the reader\", in under 15 words after the principle.",
    "Only what's working. Never say what's missing, weak or could be better, and never suggest changes.",
    "Plain text only: no preamble, no numbering, no markdown, no asterisks.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

// The reply as notes: one a line, any bullet or number stripped, no
// markdown emphasis, at most five.
export function parseWiifmNotes(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/\*\*/g, "").replace(/^[-•*\d.)\s]+/, "").trim())
    .filter(Boolean)
    .slice(0, WIIFM_MAX_NOTES);
}
