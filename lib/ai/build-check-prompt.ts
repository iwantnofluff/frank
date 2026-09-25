export type CheckTone = "ok" | "warn";

export interface CheckFinding {
  tone: CheckTone;
  title: string;
  body: string;
}

export interface CheckPromptInput {
  intro: string;
  concept: string | null;
  copyText: string;
  referenceLabel: string;
  referenceNotes: string[];
  // Titles of PDF Reference Material/Knowledge attached alongside this
  // prompt as real documents (see lib/ai/attachment.ts) — named here so
  // the model knows to read them even when there are zero text notes,
  // which is the common case for an agency whose knowledge is all files.
  attachmentTitles: string[];
  findingCount: number;
}

const FINDING_SEPARATOR = /\n-{3,}\n/;

// "Check WIIFM"/"Check Brand" — same shape as build-caption-prompt.ts:
// pure and unit-testable, the actual data-fetching (which knowledge counts
// as "text", which section a client note belongs to) stays in the
// component that calls this. The two checks differ only in what they're
// checking the copy against (agency Reference Material vs. this client's
// own Knowledge) and the framing of the intro — everything else about the
// prompt shape is identical, so one function serves both.
export function buildCheckPrompt(input: CheckPromptInput): string {
  const parts: string[] = [input.intro];

  if (input.concept) {
    parts.push(`Concept: ${input.concept}`);
  }
  parts.push(`Copy being checked:\n${input.copyText}`);
  if (input.referenceNotes.length > 0) {
    parts.push(`${input.referenceLabel}:\n${input.referenceNotes.map((n) => `- ${n}`).join("\n")}`);
  }
  if (input.attachmentTitles.length > 0) {
    parts.push(
      `${input.referenceLabel} also includes the attached document(s): ${input.attachmentTitles.join(", ")}. Read them and weigh them the same as the notes above.`,
    );
  }

  parts.push(
    [
      `List exactly ${input.findingCount} findings about this copy, most important first.`,
      `Each finding is either OK (the copy already does this well) or WARN (it doesn't, or you can't tell from what's given).`,
      `Be specific to this exact copy — never generic advice.`,
      `Format your reply as exactly ${input.findingCount} blocks separated by a`,
      `line containing only ---, each written as:`,
      `TONE: OK or WARN`,
      `TITLE: <a few words>`,
      `BODY: <one or two sentences>`,
    ].join("\n"),
  );

  return parts.join("\n\n");
}

// The inverse of the format buildCheckPrompt asks for. A block missing any
// of the three fields is dropped entirely, same reasoning as
// parseDraftOptions dropping a fieldless block — a half-parsed finding
// (e.g. a title with no body) isn't useful to show.
export function parseCheckFindings(text: string): CheckFinding[] {
  return text
    .split(FINDING_SEPARATOR)
    .map((block): CheckFinding | null => {
      const toneMatch = /TONE:\s*(OK|WARN)/i.exec(block)?.[1]?.toUpperCase();
      const title = /TITLE:\s*(.+)/i.exec(block)?.[1]?.trim();
      const bodyMatch = /BODY:\s*([\s\S]*?)(?:\n[A-Z_]+:|$)/i.exec(block);
      const body = bodyMatch?.[1]?.trim();
      if (!toneMatch || !title || !body) return null;
      return { tone: toneMatch === "WARN" ? "warn" : "ok", title, body };
    })
    .filter((f): f is CheckFinding => f !== null);
}
