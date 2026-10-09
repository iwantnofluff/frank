// A client's monthly strategy (phase78, decided directly): what's been
// decided for the month, in named fields. Draft with Frank reads the month
// a post goes live in; empty fields are left out.

export const STRATEGY_FIELDS = [
  { key: "objective", label: "Objective", hint: "What this month's content is for." },
  { key: "key_messages", label: "Key messages", hint: "What every post should get across." },
  { key: "themes", label: "Themes and campaigns", hint: "What's running this month." },
  { key: "offers", label: "Offers and promotions", hint: "Anything on sale or on offer." },
  { key: "key_dates", label: "Key dates", hint: "Launches, events and days to mark." },
  { key: "notes", label: "Notes", hint: "Anything else decided for the month." },
] as const;

export type StrategyFieldKey = (typeof STRATEGY_FIELDS)[number]["key"];
export type StrategyFields = Record<StrategyFieldKey, string | null>;

// A month as its first day, YYYY-MM-01, from a date or an ISO string.
export function monthOf(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

// "October 2026".
export function monthLabel(month: string): string {
  return new Date(`${month}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

// The month after (or before, with -1).
export function addMonths(month: string, n: number): string {
  const d = new Date(`${month}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return monthOf(d);
}

// The filled fields only, in order.
export function filledFields(row: Partial<StrategyFields> | null | undefined) {
  return STRATEGY_FIELDS.filter((f) => row?.[f.key]?.trim()).map((f) => ({ ...f, value: row![f.key]!.trim() }));
}

// For a prompt: the month's filled fields, or null when there are none.
export function strategyForPrompt(month: string, row: Partial<StrategyFields> | null | undefined): string | null {
  const filled = filledFields(row);
  if (!filled.length) return null;
  return `The client's strategy for ${monthLabel(month)}, the month this post goes live (follow it):\n${filled
    .map((f) => `${f.label}: ${f.value}`)
    .join("\n")}`;
}
