export interface CopyFieldSpec {
  key: string;
  label: string;
}

export interface CaptionPromptInput {
  concept: string | null;
  approachNotes: string[];
  formatLabel: string;
  formatDirection: string | null;
  agencyNotes: string[]; // agency Reference Material, text entries only
  clientNotes: string[]; // client Knowledge, text entries only
  optionCount: number;
  // Which copy_versions.fields keys this format actually uses (lib/formats.ts's
  // own per-format list) — Meta Feed Ad drafts primary+headline+description+cta
  // together, Instagram Feed drafts just caption+alt, and so on. Never a fixed
  // caption/headline/cta triple regardless of format.
  fields: CopyFieldSpec[];
}

export interface DraftOption {
  principle: string;
  fields: Record<string, string>;
}

const OPTION_SEPARATOR = /\n-{3,}\n/;

// "Draft from Brief" — the concept and approach notes are the brief
// itself, "reference" is both knowledge layers (agency-wide Reference
// Material, client-specific Knowledge) plus the format's own direction.
// Pure and unit-testable on purpose: the actual data-fetching (which
// entries count as "text", which format direction row matches, which
// fields this format needs) stays in the component that calls this, this
// just assembles/parses strings.
//
// Asks for several options in one call rather than one call per option —
// each request already counts once against the agency's monthly cap
// (app/api/ai/draft/route.ts), so three options for the price of one
// request is the point, not an accident.
export function buildCaptionPrompt(input: CaptionPromptInput): string {
  const parts: string[] = [
    `Write ${input.optionCount} different copy options for the following brief.`,
  ];

  if (input.concept) {
    parts.push(`Concept: ${input.concept}`);
  }
  if (input.approachNotes.length > 0) {
    parts.push(`What the reader should get from this (WIIFM):\n${input.approachNotes.map((n) => `- ${n}`).join("\n")}`);
  }
  parts.push(`Format: ${input.formatLabel}`);
  if (input.formatDirection) {
    parts.push(`Format direction:\n${input.formatDirection}`);
  }
  if (input.agencyNotes.length > 0) {
    parts.push(
      `Agency reference material:\n${input.agencyNotes.map((n) => `- ${n}`).join("\n")}`,
    );
  }
  if (input.clientNotes.length > 0) {
    parts.push(`Client knowledge:\n${input.clientNotes.map((n) => `- ${n}`).join("\n")}`);
  }

  const fieldLines = input.fields
    .map((f) => `${f.key.toUpperCase()}: <${f.label}, nothing else>`)
    .join("\n");

  parts.push(
    [
      `Each option should be grounded in a different persuasion principle —`,
      `draw from the reference material above where one applies, or a`,
      `well-known principle otherwise (e.g. scarcity, social proof, authority).`,
      `This format needs exactly these fields, every option: ${input.fields.map((f) => f.label).join(", ")}.`,
      `Format your reply as exactly ${input.optionCount} blocks separated by a`,
      `line containing only ---, each written as:`,
      `PRINCIPLE: <short principle name>`,
      fieldLines,
    ].join("\n"),
  );

  return parts.join("\n\n");
}

// The inverse of the format buildCaptionPrompt asks for. A block missing
// the principle line still comes back as one option (falls back to
// "Suggestion") rather than being dropped — a model that doesn't follow
// the format exactly shouldn't silently lose an entire option. A field
// line the model omitted is just absent from the result, not an empty
// string — the caller decides what an unfilled field means.
export function parseDraftOptions(text: string, fields: CopyFieldSpec[]): DraftOption[] {
  return text
    .split(OPTION_SEPARATOR)
    .map((block): DraftOption => {
      const principle = /PRINCIPLE:\s*(.+)/i.exec(block)?.[1]?.trim();
      const values: Record<string, string> = {};
      for (const f of fields) {
        const re = new RegExp(`${f.key.toUpperCase()}:\\s*([\\s\\S]*?)(?:\\n[A-Z_]+:|$)`, "i");
        const m = re.exec(block);
        const value = m?.[1]?.trim();
        if (value) values[f.key] = value;
      }
      return { principle: principle || "Suggestion", fields: values };
    })
    .filter((option) => Object.keys(option.fields).length > 0);
}
