import type { PlanId } from "../plans.ts";

// Each paid plan's Paddle prices (phase39). Sandbox's are the catalog set up
// on 3 Oct 2026; live gets its own set when the account switches over.
export type Interval = "monthly" | "annual";
export type PaddleEnv = "sandbox" | "production";

type PriceTable = Partial<Record<PlanId, Record<Interval, string>>>;

const PRICES: Record<PaddleEnv, PriceTable> = {
  sandbox: {
    starter: { monthly: "pri_01m4026egrq97tg3tgn2mxmfh2", annual: "pri_01m4027bs1fkcdmh9ng393sjt0" },
    growth: { monthly: "pri_01m4029436mvsghxnh6ytbea0m", annual: "pri_01m402a0vtv0mnby69zwjvn9bz" },
    agency: { monthly: "pri_01m3zym21ahxm3424m3xjm94ft", annual: "pri_01m3zynjehbqke9ygsh6ngx4kk" },
  },
  production: {},
};

export function paddleEnv(): PaddleEnv {
  return process.env.PADDLE_ENV === "production" ? "production" : "sandbox";
}

export function priceFor(plan: PlanId, interval: Interval, env: PaddleEnv = paddleEnv()): string | null {
  return PRICES[env][plan]?.[interval] ?? null;
}

export function planForPrice(priceId: string, env: PaddleEnv = paddleEnv()): { plan: PlanId; interval: Interval } | null {
  for (const [plan, byInterval] of Object.entries(PRICES[env]) as [PlanId, Record<Interval, string>][]) {
    if (byInterval.monthly === priceId) return { plan, interval: "monthly" };
    if (byInterval.annual === priceId) return { plan, interval: "annual" };
  }
  return null;
}
