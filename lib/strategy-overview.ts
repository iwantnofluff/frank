import { filledFields, monthLabel, type StrategyFields } from "./monthly-strategy.ts";

// The overview in each Strategy box on a client's page (phase83, decided
// directly): what it's written from, and a fingerprint of that, worked out
// the same way on the page and on the server, so the page knows when an
// overview is out of date and the server only rewrites one that is.

export const OVERVIEW_SECTIONS = {
  tone: "Tone of Voice",
  audience: "Target Audience",
  features: "Prioritised Features",
} as const;
export type OverviewSection = keyof typeof OVERVIEW_SECTIONS;

export interface OverviewEntry {
  kind: string;
  title: string;
  body: string | null;
}

// A Knowledge section's entries as text: a note's words in full; a link,
// file or picture by its name only (Frank can't read those here).
export function sectionSource(entries: OverviewEntry[]): string {
  return entries
    .map((e) => {
      const title = e.title?.trim();
      if (e.kind === "text" && e.body?.trim()) return title ? `${title}: ${e.body.trim()}` : e.body.trim();
      const what = e.kind === "link" ? "A link" : e.kind === "image" ? "A picture" : "A file";
      return title ? `${what} named "${title}"` : null;
    })
    .filter((line): line is string => !!line)
    .join("\n\n");
}

// A month's strategy as text, its filled fields only.
export function monthSource(row: Partial<StrategyFields> | null | undefined): string {
  return filledFields(row)
    .map((f) => `${f.label}: ${f.value}`)
    .join("\n\n");
}

// The box's key in client_strategy_overviews.
export function monthSection(month: string): string {
  return `month:${month}`;
}

// Which way overviews are written: changing it (as when they became
// paragraphs) has each box rewritten once, the next time the team opens it.
const OVERVIEW_STYLE = "paragraphs-1";

// The fingerprint an overview is saved with: what it's from, and how it's
// written.
export function overviewHash(source: string): string {
  return sourceHash(`${OVERVIEW_STYLE}\n${source}`);
}

// FNV-1a, 32-bit: the same in the browser and on the server.
export function sourceHash(source: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < source.length; i++) {
    h ^= source.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// What Frank is asked to write.
export function overviewPrompt(clientName: string, what: string, source: string): string {
  return [
    `You write short snapshots for an agency team about their client ${clientName}.`,
    `Below is everything the team has recorded as the client's ${what}.`,
    "Rewrite it as an overview of 60 to 100 words that someone could read in a few seconds before starting work for this client,",
    "in two or three short paragraphs, each about one idea, separated by a blank line.",
    "Cover all of it, the most important first. Use only what is below; never add anything.",
    "Describe what has been recorded; don't give advice, recommendations or conclusions of your own.",
    "Plain sentences only: no headings, no lists, no markdown, no preamble, and don't start with the client's name or the section's name.",
    "",
    source,
  ].join("\n");
}

// The label of a month's box.
export function monthWhat(month: string): string {
  return `strategy for ${monthLabel(month)}`;
}

// An overview's paragraphs, however many blank lines Frank put between them.
export function overviewParagraphs(overview: string): string[] {
  return overview
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The month's box on a client's page (direct instruction): "Oct 2026
// Strategy". Fixed names, as some browsers shorten September to "Sept".
export function monthBoxLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${MONTHS_SHORT[Number(m) - 1]} ${y} Strategy`;
}
