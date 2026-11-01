import { parseCheckFindings, type CheckFinding } from "./build-check-prompt.ts";

// "Check Design" (direct instruction): the latest artwork's logo size and
// position and its fonts against the client's last Approved or Live posts,
// fonts against the brand's own where Client Knowledge names them, and the
// basics of visual hierarchy. Pure, as build-creative-check-prompt.ts is;
// the route gathers the images, attached in this order: the client's logo
// (when there is one), each slide of the post being checked, then each
// earlier post.

export const DESIGN_AREAS = ["Logo Size", "Logo Position", "Fonts", "Visual Hierarchy"] as const;

export interface DesignCheckInput {
  noun: string;
  // How many of the post's slides are attached, in order.
  slides: number;
  // How many earlier posts are attached, one image each, newest first.
  earlier: number;
  hasLogo: boolean;
  // The client's Knowledge notes, each with its section.
  brandNotes: string[];
}

export function buildDesignCheckPrompt(input: DesignCheckInput): string {
  const { noun, slides, earlier, hasLogo, brandNotes } = input;
  const n = noun.toLowerCase();
  const parts: string[] = [
    "You review social media artwork for a design agency's team before it goes to the client. You judge the design, not the words.",
  ];
  const attached: string[] = [];
  if (hasLogo) attached.push(`an image titled "Client logo": the client's own logo`);
  attached.push(
    slides === 1
      ? `an image titled "${noun} 1": the artwork being checked`
      : `${slides} images titled "${noun} 1" to "${noun} ${slides}": the artwork being checked, one ${n} each`,
  );
  if (earlier > 0)
    attached.push(
      `${earlier} image${earlier === 1 ? "" : "s"} titled "Earlier post 1"${earlier > 1 ? ` to "Earlier post ${earlier}"` : ""}: the client's most recent approved posts, newest first, showing how their posts usually look`,
    );
  parts.push(`Attached, in order: ${attached.join("; ")}.`);
  if (brandNotes.length) parts.push(`The client's brand knowledge:\n${brandNotes.map((b) => `- ${b}`).join("\n")}`);

  const compare = earlier > 0;
  parts.push(
    [
      "Check these four things:",
      `Logo Size: ${compare ? "whether the logo is about the same size, relative to the artwork, as on the earlier posts; if it differs noticeably, say roughly by how much (for example about a third smaller)" : "there are no earlier posts to compare with, so whether the logo is a sensible, legible size for the artwork"}. ${hasLogo ? "Use the client logo image to recognise it." : ""} If there is no logo, say so as WARN.`,
      `Logo Position: ${compare ? "where the logo sits (which corner or edge, how far in) and whether that matches where it usually sits on the earlier posts" : "where the logo sits and whether it is clear of the edges and other elements"}.`,
      `Fonts: ${brandNotes.length ? "if the brand knowledge names the brand's fonts, whether the artwork uses them; otherwise " : ""}${compare ? "whether the typefaces look consistent with the earlier posts (serif or sans-serif, weight, width, style)" : "whether the typefaces work together, with no more than two families"}. Don't claim to name a font you can't be sure of; describe it.`,
      "Visual Hierarchy: alignment (text and elements on a shared edge or centre line), size (the most important words largest, then a clear order), proximity (related things together, unrelated apart), contrast and spacing (legible, nothing cramped or touching the edges).",
      `For a carousel, judge every ${n} and name the ${n} when something is wrong on only some of them.`,
      "Each is OK when it's right, and WARN when something should change: say exactly what and where, plainly, in one or two sentences.",
      "Reply with exactly 4 blocks, in the order above, separated by a line containing only ---, each written as:",
      "TONE: OK or WARN",
      "TITLE: <Logo Size, Logo Position, Fonts or Visual Hierarchy>",
      "BODY: <one or two sentences>",
    ].join("\n"),
  );
  return parts.join("\n\n");
}

// The four findings, in order: the model's matched by title, else by order;
// one it left out says so.
export function designCheckFindings(reply: string): CheckFinding[] {
  const parsed = parseCheckFindings(reply);
  const named = new Map<string, CheckFinding>();
  for (const f of parsed) {
    const area = DESIGN_AREAS.find((a) => f.title.toLowerCase().includes(a.toLowerCase()));
    if (area && !named.has(area)) named.set(area, f);
  }
  return DESIGN_AREAS.map((area, i) => {
    const found = named.get(area) ?? (named.size === 0 ? parsed[i] : undefined);
    return found
      ? { ...found, title: area }
      : { tone: "warn", title: area, body: "Frank couldn't read a result for this one. Try the check again." };
  });
}
