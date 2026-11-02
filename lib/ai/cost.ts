import { modelById } from "./models.ts";

// What a request cost Frank, worked out from its recorded tokens (phase128)
// for the admin area's estimates. Dollars per million tokens: input, input
// read back from the provider's cache, output. Approximate, from each
// provider's list prices as of 2 Nov 2026; update them here when a
// provider's change. Cache writes are counted at the input price (Claude
// charges a little more), so a first long conversation reads slightly low.
export const PRICES_PER_MILLION: Record<string, { input: number; cacheRead: number; output: number }> = {
  "claude-opus-5-5": { input: 4, cacheRead: 0.2, output: 20 },
  "claude-sonnet-5-5": { input: 2, cacheRead: 0.2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, cacheRead: 0.01, output: 0.5 },
  "claude-opus-5": { input: 5, cacheRead: 0.5, output: 25 },
  "claude-sonnet-5": { input: 2, cacheRead: 0.2, output: 10 },
  "claude-haiku-4-5-20251001": { input: 1, cacheRead: 0.1, output: 5 },
  "gpt-4.1": { input: 2, cacheRead: 0.5, output: 8 },
  "gpt-4.1-mini": { input: 0.4, cacheRead: 0.1, output: 1.6 },
  "gemini-2.5-pro": { input: 1.25, cacheRead: 0.31, output: 10 },
  "gemini-2.5-flash": { input: 0.3, cacheRead: 0.075, output: 2.5 },
};

export interface UsageRow {
  model: string;
  input_tokens: number | null;
  cache_read_tokens: number | null;
  output_tokens: number | null;
}

// One request's cost in dollars, or null when it can't be told: no tokens
// recorded (before 1.64), or a model with no price here.
export function requestCost(row: UsageRow): number | null {
  const price = PRICES_PER_MILLION[row.model];
  if (!price || !modelById(row.model) || row.input_tokens === null || row.output_tokens === null) return null;
  return (
    (row.input_tokens * price.input + (row.cache_read_tokens ?? 0) * price.cacheRead + row.output_tokens * price.output) /
    1_000_000
  );
}

// Many requests: the known cost, and how many couldn't be priced.
export function totalCost(rows: UsageRow[]): { dollars: number; unpriced: number } {
  let dollars = 0;
  let unpriced = 0;
  for (const r of rows) {
    const c = requestCost(r);
    if (c === null) unpriced += 1;
    else dollars += c;
  }
  return { dollars, unpriced };
}
