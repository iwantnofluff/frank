import { parseCheckFindings, type CheckFinding } from "./build-check-prompt.ts";

// "Check Creative" (direct instruction): whether each slide's artwork says
// what its Text on Image says. Pure, as build-check-prompt.ts is; the route
// loads the slides and their images. Each slide with artwork is attached as
// an image titled "Slide n", in order; a slide with none is reported
// without asking the model at all (creativeCheckFindings).

export interface CreativeCheckSlide {
  // 1-based, as the team numbers them.
  n: number;
  // Its Text on Image, as saved; empty when there's none.
  text: string;
  // Whether its artwork is attached.
  hasImage: boolean;
  // Why not, when it has artwork Frank couldn't send (too big, a video).
  note?: string;
}

export function buildCreativeCheckPrompt(slides: CreativeCheckSlide[], noun = "Slide"): string {
  const shown = slides.filter((s) => s.hasImage);
  return [
    `You proofread social media artwork against the words it was meant to carry. Each ${noun.toLowerCase()}'s artwork is attached as an image titled "${noun} n". Under it is that ${noun.toLowerCase()}'s Text on Image: the words the designer was given to put on it.`,
    shown
      .map((s) => `${noun} ${s.n} Text on Image:\n${s.text.trim() ? s.text.trim() : "(none: nothing was meant to be written on it)"}`)
      .join("\n\n"),
    [
      `For each ${noun.toLowerCase()}, read every word on the artwork and compare it with its Text on Image. Look for words missing or added, misspellings, wrong numbers, prices or dates, and wording changed. Ignore line breaks, capitals used for style, and small print such as a logo, handle or legal line, unless it contradicts the Text on Image.`,
      `If the artwork carries the Text on Image faithfully, it is OK. If anything differs, it is WARN: quote what the artwork says and what it should say. Where nothing was meant to be written, it is OK if the artwork has no headline text and WARN if it has some.`,
      `Reply with exactly ${shown.length} block${shown.length === 1 ? "" : "s"}, one for each ${noun.toLowerCase()} in the order given, separated by a line containing only ---, each written as:`,
      `TONE: OK or WARN`,
      `TITLE: ${noun} <n>`,
      `BODY: <one or two sentences>`,
    ].join("\n"),
  ].join("\n\n");
}

// Every slide's finding, in order: the model's for those it saw (matched by
// the "Slide n" in its title, else by order), and one of its own for each
// slide with no artwork. A slide the model left out says so.
export function creativeCheckFindings(slides: CreativeCheckSlide[], reply: string, noun = "Slide"): CheckFinding[] {
  const parsed = parseCheckFindings(reply);
  const shown = slides.filter((s) => s.hasImage);
  const byNumber = new Map<number, CheckFinding>();
  for (const f of parsed) {
    const n = Number(new RegExp(`${noun}\\s*(\\d+)`, "i").exec(f.title)?.[1]);
    if (n && !byNumber.has(n)) byNumber.set(n, f);
  }
  return slides.map((s) => {
    const title = `${noun} ${s.n}`;
    if (!s.hasImage) {
      return { tone: "warn", title, body: s.note ?? `No artwork on this ${noun.toLowerCase()} yet, so there's nothing to check.` };
    }
    const found = byNumber.get(s.n) ?? (byNumber.size === 0 ? parsed[shown.indexOf(s)] : undefined);
    return found
      ? { ...found, title }
      : { tone: "warn", title, body: "Frank couldn't read a result for this one. Try the check again." };
  });
}
