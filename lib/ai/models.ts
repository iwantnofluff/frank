export type AiProvider = "anthropic" | "openai" | "google";
export type CostTier = "capable" | "balanced" | "fast";

export interface AiModelOption {
  id: string; // exact model string sent to the provider's own API
  provider: AiProvider;
  label: string;
  tier: CostTier;
  tierLabel: string;
}

// Relative cost tiers, not $ figures — provider pricing changes often
// enough that a hardcoded number here would go stale and mislead. One
// option per provider per tier is enough for an agency to pick a
// reasonable default without needing to compare exact pricing.
export const AI_MODELS: AiModelOption[] = [
  { id: "claude-opus-5", provider: "anthropic", label: "Claude Opus 5", tier: "capable", tierLabel: "Most capable" },
  { id: "claude-sonnet-5", provider: "anthropic", label: "Claude Sonnet 5", tier: "balanced", tierLabel: "Balanced" },
  { id: "claude-haiku-4-5-20251001", provider: "anthropic", label: "Claude Haiku 4.5", tier: "fast", tierLabel: "Fastest / cheapest" },

  { id: "gpt-4.1", provider: "openai", label: "ChatGPT — GPT-4.1", tier: "capable", tierLabel: "Most capable" },
  { id: "gpt-4.1-mini", provider: "openai", label: "ChatGPT — GPT-4.1 mini", tier: "fast", tierLabel: "Fastest / cheapest" },

  { id: "gemini-2.5-pro", provider: "google", label: "Gemini 2.5 Pro", tier: "capable", tierLabel: "Most capable" },
  { id: "gemini-2.5-flash", provider: "google", label: "Gemini 2.5 Flash", tier: "fast", tierLabel: "Fastest / cheapest" },
];

export const DEFAULT_MODEL_ID = "claude-opus-5";

export function modelById(id: string): AiModelOption | undefined {
  return AI_MODELS.find((m) => m.id === id);
}
