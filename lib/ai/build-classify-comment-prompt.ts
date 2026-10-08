import type { Anchor } from "@/lib/annotations";

export type IssueCategory =
  | "claim_or_compliance"
  | "tone_and_brand"
  | "craft_and_layout"
  | "copy_clarity"
  | "factual_error"
  | "scope_change"
  | "preference"
  | "timing"
  | "no_issue";

// The source doc's own eight ("1. Comment intelligence — Classifying what
// comes back"), plus one addition of ours: `no_issue`, for a comment that
// isn't a correction at all (plain praise, an auto-generated "Approved via
// shared review link." message, a Make Changes click with an empty box).
// Single source of truth for the prompt text, the DB check constraint
// (supabase/migrations/phase20_comment_issue_category.sql — keep in sync
// by hand, Postgres has no way to import this), and any UI label.
export const ISSUE_CATEGORIES: { key: IssueCategory; label: string; description: string }[] = [
  { key: "claim_or_compliance", label: "Claim or Compliance", description: "a number, a superlative or a claim that needs substantiating" },
  { key: "tone_and_brand", label: "Tone and Brand", description: "right meaning, wrong voice for this brand" },
  { key: "craft_and_layout", label: "Craft and Layout", description: "crop, spacing, legibility, safe areas, hierarchy" },
  { key: "copy_clarity", label: "Copy Clarity", description: "ambiguous, too long, buried the point" },
  { key: "factual_error", label: "Factual Error", description: "a name, price, date or spec that is simply wrong" },
  { key: "scope_change", label: "Scope Change", description: "the client has changed what they asked for" },
  { key: "preference", label: "Preference", description: "no rule was broken, they want it different" },
  { key: "timing", label: "Timing", description: "date, channel, sequencing" },
  { key: "no_issue", label: "No Issue", description: "not a correction at all — praise, acknowledgement, or a procedural message" },
];

const CATEGORY_KEYS = new Set<string>(ISSUE_CATEGORIES.map((c) => c.key));

function anchorContext(anchor: Anchor | null): string | null {
  if (!anchor) return null;
  if (anchor.type === "highlight") {
    return `This comment highlights this exact wording in the copy: "${anchor.quote}"`;
  }
  // Pin/region: a point or box on the artwork itself, not on any text.
  return "This comment is pinned directly on the artwork image, not on any text.";
}

// Mirrors build-check-prompt.ts's shape: a pure, unit-tested build/parse
// pair, one label:value block, no markdown.
export function buildClassifyCommentPrompt(input: {
  body: string;
  anchor: Anchor | null;
  format: string;
}): string {
  const parts: string[] = [
    "You classify a single comment left on a piece of ad/social creative into exactly one category.",
    `Format being reviewed: ${input.format}`,
  ];

  const anchor = anchorContext(input.anchor);
  if (anchor) parts.push(anchor);

  parts.push(`The comment:\n${input.body}`);

  parts.push(
    [
      "The categories, choose exactly one:",
      ...ISSUE_CATEGORIES.map((c) => `- ${c.key}: ${c.description}`),
      "",
      "Also judge its mood: positive (pleased, praising, approving), neutral (matter-of-fact), or negative (unhappy, frustrated, rejecting).",
      "",
      "Reply as exactly one block:",
      "CATEGORY: <one of the keys above, exactly as written>",
      "MOOD: <positive, neutral or negative>",
      "NOTE: <one short sentence explaining why>",
    ].join("\n"),
  );

  return parts.join("\n\n");
}

// A comment's mood (phase71, for Analytics), asked in the same call.
export type CommentSentiment = "positive" | "neutral" | "negative";
const SENTIMENTS = new Set<string>(["positive", "neutral", "negative"]);

export function parseClassification(
  text: string,
): { category: IssueCategory; note: string; sentiment: CommentSentiment | null } | null {
  const categoryMatch = /CATEGORY:\s*([a-z_]+)/i.exec(text)?.[1]?.trim().toLowerCase();
  const noteMatch = /NOTE:\s*([\s\S]*?)(?:\n[A-Z_]+:|$)/i.exec(text);
  const note = noteMatch?.[1]?.trim();
  if (!categoryMatch || !note || !CATEGORY_KEYS.has(categoryMatch)) return null;
  // A missing or unknown mood leaves it unset rather than losing the rest.
  const mood = /MOOD:\s*([a-z]+)/i.exec(text)?.[1]?.trim().toLowerCase();
  return { category: categoryMatch as IssueCategory, note, sentiment: mood && SENTIMENTS.has(mood) ? (mood as CommentSentiment) : null };
}
