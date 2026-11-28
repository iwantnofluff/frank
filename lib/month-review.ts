// Check the Month (phase173, direct instruction): Frank's review of a
// project's posts for one month, as a whole, against the client's Knowledge
// and that month's strategy. The direction of the month's content, not any
// one post's wording. Words only (decided directly): concepts, copy, Text on
// Image and VO, never the artwork.

export type MonthVerdict = "on_track" | "drifting" | "off_track";

export interface MonthReview {
  verdict: MonthVerdict;
  summary: string;
  // The month's strategy: what the posts carry, and what they leave out.
  strategyCovered: string[];
  strategyMissing: string[];
  // The brand's Knowledge: where the month fits it, and where it falls short.
  brandStrengths: string[];
  brandGaps: string[];
  // Formats, repetition, rhythm across the month, and the count.
  mix: string[];
  risks: string[];
  suggestions: string[];
}

export const VERDICT_LABELS: Record<MonthVerdict, string> = {
  on_track: "On track",
  drifting: "Drifting",
  off_track: "Off track",
};

export interface MonthReviewPost {
  date: string; // YYYY-MM-DD
  name: string;
  stage: string;
  formats: string;
  concept: string | null;
  copy: string | null;
  textOnImage: string | null;
  voiceover: string | null;
}

const cut = (text: string | null | undefined, max: number) => {
  const t = (text ?? "").trim().replace(/\n{3,}/g, "\n\n");
  return t.length > max ? `${t.slice(0, max)}…` : t;
};

// Whether a post's go-live day falls in the month (YYYY-MM-01).
export function inMonth(day: string | null, month: string): boolean {
  return !!day && day.slice(0, 7) === month.slice(0, 7);
}

export function monthReviewPrompt(input: {
  clientName: string;
  projectName: string;
  monthLabel: string;
  knowledge: { section: string; title: string; body: string }[];
  strategy: string | null;
  contractedPosts: number | null;
  posts: MonthReviewPost[];
}): string {
  const knowledge = input.knowledge.length
    ? input.knowledge.map((k) => `[${k.section}] ${k.title ? `${k.title}: ` : ""}${cut(k.body, 1500)}`).join("\n\n")
    : "Nothing recorded yet.";
  const posts = input.posts.length
    ? input.posts
        .map((p, i) =>
          [
            `${i + 1}. ${p.date} · ${p.name} · ${p.formats} · ${p.stage}`,
            p.concept && `Concept: ${cut(p.concept, 700)}`,
            p.copy && `Copy: ${cut(p.copy, 900)}`,
            p.textOnImage && `Text on Image: ${cut(p.textOnImage, 400)}`,
            p.voiceover && `VO: ${cut(p.voiceover, 500)}`,
            !p.concept && !p.copy && !p.textOnImage && !p.voiceover && "Nothing written yet.",
          ]
            .filter(Boolean)
            .join("\n"),
        )
        .join("\n\n")
    : "No posts planned this month.";
  return [
    `You are a senior strategist at an agency, reviewing the direction of a month's social content for their client ${input.clientName}.`,
    `Below is the client's brand knowledge, its strategy for ${input.monthLabel}, and every post planned in the project "${input.projectName}" for ${input.monthLabel}.`,
    "Judge the month as a whole: whether, together, the posts carry the strategy and fit the brand. Don't rewrite or critique any single post's wording; mention a post by its number and name only where it shows a pattern.",
    "Base everything on what is below. Never invent facts about the brand. Where the knowledge or strategy is missing, say so rather than guess.",
    input.contractedPosts ? `The client's contract is ${input.contractedPosts} posts a month.` : "",
    "",
    "Reply with one JSON object and nothing else, with these keys:",
    '- "verdict": "on_track", "drifting" or "off_track".',
    '- "summary": two or three sentences on the month\'s direction.',
    '- "strategyCovered": the strategy\'s objective, key messages, themes, offers and key dates that the posts carry, each with the posts that carry it.',
    '- "strategyMissing": those the posts leave out or barely touch.',
    '- "brandStrengths": where the month fits the brand: tone, the audiences it speaks to, the prioritised features it leads with, the client rules it keeps.',
    '- "brandGaps": audiences, features or rules it neglects or goes against.',
    '- "mix": the balance of formats and themes, repetition, how the posts fall across the month, and the count against the contract.',
    '- "risks": anything that could land badly with the client or their audience.',
    '- "suggestions": three to five concrete changes of direction for the rest of the month.',
    "Each list is short plain sentences, at most six items, empty when there's nothing to say. Plain text in every value: no markdown.",
    "",
    "## Brand knowledge",
    knowledge,
    "",
    `## Strategy for ${input.monthLabel}`,
    input.strategy ?? "No strategy written for this month.",
    "",
    `## Posts in ${input.monthLabel}`,
    posts,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()).slice(0, 8) : [];

// Frank's answer, read leniently (a fence, words around it); null when it
// isn't a review at all.
export function parseMonthReview(text: string): MonthReview | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const verdict = raw.verdict === "on_track" || raw.verdict === "drifting" || raw.verdict === "off_track" ? raw.verdict : null;
  const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
  if (!verdict || !summary) return null;
  return {
    verdict,
    summary,
    strategyCovered: list(raw.strategyCovered),
    strategyMissing: list(raw.strategyMissing),
    brandStrengths: list(raw.brandStrengths),
    brandGaps: list(raw.brandGaps),
    mix: list(raw.mix),
    risks: list(raw.risks),
    suggestions: list(raw.suggestions),
  };
}
