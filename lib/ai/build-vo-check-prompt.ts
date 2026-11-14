import { parseCheckFindings } from "./build-check-prompt.ts";

// "Check VO and Text on Image" (direct instruction): whether the voiceover
// and the words on the artwork say the same thing, in wording and in
// meaning. Pure, as build-creative-check-prompt.ts is; the route sends the
// words the window holds. The reply is Check Creative's block form: an
// Overall block first, then one per mismatch, its title starting Wording
// or Meaning.

export interface VoCheckInput {
  postName: string;
  // The VO script.
  vo: string;
  // Each slide's or story's Text on Image, or one for a single piece.
  texts: string[];
  // "Slide", "Story", or "Image" for a single piece.
  noun: string;
}

export interface VoMismatch {
  kind: "wording" | "meaning";
  title: string;
  body: string;
}

export interface VoCheckResult {
  same: boolean;
  summary: string;
  mismatches: VoMismatch[];
}

export function buildVoCheckPrompt({ postName, vo, texts, noun }: VoCheckInput): string {
  const onImage =
    texts.length > 1
      ? texts.map((t, i) => `${noun} ${i + 1}:\n${t.trim() || "(none)"}`).join("\n\n")
      : (texts[0] ?? "").trim() || "(none)";
  return [
    `You check a social media video post, "${postName}", before it goes to the client. Its voiceover (VO) is spoken over the video while its Text on Image is written on screen. The two must communicate the same thing: a viewer who only hears the VO, and one who only reads the screen, should come away with the same message.`,
    `VO:\n${vo.trim()}`,
    `Text on Image:\n${onImage}`,
    [
      "Compare them in two ways.",
      "Wording: facts that differ between them (names, numbers, prices, dates, product or brand names, claims), or a key line in one that the other contradicts. The VO may say more than the screen, and the screen may shorten the VO; that alone is not a mismatch.",
      "Meaning: whether they make the same point, in the same order where order matters, with the same promise and tone. Flag a point one makes that the other undercuts, misses or turns around, and any line whose interpretation differs.",
      "Reply in blocks separated by a line containing only ---.",
      "First, exactly one block titled Overall: TONE OK if they communicate the same thing, WARN if not, and a BODY of one or two sentences saying so.",
      "Then one block for each mismatch you find, none if there are none. Its TONE is WARN, its TITLE starts with Wording: or Meaning: followed by a few words naming it, and its BODY quotes what the VO says and what the Text on Image says, then says in a sentence what to change.",
      "Each block is written as:",
      "TONE: OK or WARN",
      "TITLE: <title>",
      "BODY: <text>",
    ].join("\n"),
  ].join("\n\n");
}

// The model's reply as a verdict and its mismatches. No Overall block: the
// verdict follows the mismatches; nothing readable at all says so.
export function voCheckResult(reply: string): VoCheckResult {
  const parsed = parseCheckFindings(reply);
  const overall = parsed.find((f) => /^overall\b/i.test(f.title));
  const mismatches: VoMismatch[] = parsed
    .filter((f) => f !== overall)
    .map((f) => {
      const meaning = /^meaning\b/i.test(f.title);
      return { kind: meaning ? "meaning" : "wording", title: f.title.replace(/^(wording|meaning)\s*[:\-–]\s*/i, "").trim() || f.title, body: f.body };
    });
  if (!overall && !mismatches.length) {
    return { same: false, summary: "Frank couldn't read a result. Try the check again.", mismatches: [] };
  }
  return {
    same: overall ? overall.tone === "ok" && !mismatches.length : !mismatches.length,
    summary: overall?.body ?? (mismatches.length ? "They don't quite say the same thing." : "They say the same thing."),
    mismatches,
  };
}
