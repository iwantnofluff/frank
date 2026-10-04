import type { SupabaseClient } from "@supabase/supabase-js";
import { paddle } from "@/lib/billing/paddle";
import { paddleEnv } from "@/lib/billing/prices";
import { listSuppressions, recentEmails } from "@/lib/email/resend-api";

// One agency's billing and email, for its admin page (decided directly,
// 4 Oct 2026). Read-only: from our billing record, Paddle's transactions,
// and Resend. A service that can't be reached is reported, not hidden.

export interface AgencyBilling {
  subscriptionId: string | null;
  status: string | null;
  interval: string | null;
  renewsAt: string | null;
  scheduledPlan: string | null;
  cancelAt: string | null;
  // Paddle's dashboard (sandbox or live). There's no documented link to
  // one subscription, so the id is shown to search for.
  dashboardUrl: string;
  payments: { id: string; status: string; at: string | null; amount: string | null }[];
  paymentsError: string | null;
}

export interface EmailProblem {
  email: string;
  problem: string;
  at: string;
  subject?: string;
}

const money = (minor: string | undefined, currency: string | undefined) =>
  minor && currency
    ? `${(Number(minor) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${currency}`
    : null;

export async function loadAgencyBilling(admin: SupabaseClient, agencyId: string): Promise<AgencyBilling | null> {
  const { data: b } = await admin
    .from("agency_billing")
    .select("paddle_subscription_id, status, billing_interval, period_ends_at, scheduled_plan, cancel_at")
    .eq("agency_id", agencyId)
    .maybeSingle();
  if (!b) return null;
  const billing: AgencyBilling = {
    subscriptionId: b.paddle_subscription_id,
    status: b.status,
    interval: b.billing_interval,
    renewsAt: b.period_ends_at,
    scheduledPlan: b.scheduled_plan,
    cancelAt: b.cancel_at,
    dashboardUrl: paddleEnv() === "production" ? "https://vendors.paddle.com" : "https://sandbox-vendors.paddle.com",
    payments: [],
    paymentsError: null,
  };
  if (b.paddle_subscription_id) {
    try {
      const txns = await paddle<
        {
          id: string;
          status: string;
          billed_at: string | null;
          created_at: string;
          currency_code?: string;
          details?: { totals?: { grand_total?: string } };
        }[]
      >(
        "GET",
        `/transactions?subscription_id=${encodeURIComponent(b.paddle_subscription_id)}&order_by=created_at[DESC]&per_page=5`,
      );
      billing.payments = txns.map((t) => ({
        id: t.id,
        status: t.status,
        at: t.billed_at ?? t.created_at,
        amount: money(t.details?.totals?.grand_total, t.currency_code),
      }));
    } catch (e) {
      billing.paymentsError = (e as Error).message;
    }
  }
  return billing;
}

const BAD_EVENTS: Record<string, string> = {
  bounced: "Bounced",
  complained: "Marked as spam",
  failed: "Failed to send",
  delivery_delayed: "Delivery delayed",
  suppressed: "Not sent: the address is suppressed",
};
const ORIGIN: Record<string, string> = {
  bounce: "Resend won't send to it: it bounced",
  complaint: "Resend won't send to it: marked as spam",
  manual: "Resend won't send to it: suppressed by hand",
};

// Problems with the emails of the agency's people: addresses Resend has
// stopped sending to, and recent emails that bounced or failed.
export async function loadEmailProblems(emails: string[]): Promise<{ problems: EmailProblem[]; error: string | null }> {
  const mine = new Set(emails.map((e) => e.toLowerCase()));
  try {
    const [suppressed, recent] = await Promise.all([listSuppressions(), recentEmails()]);
    const problems: EmailProblem[] = [
      ...suppressed
        .filter((s) => mine.has(s.email.toLowerCase()))
        .map((s) => ({ email: s.email, problem: ORIGIN[s.origin] ?? "Suppressed", at: s.created_at })),
      ...recent.flatMap((e) =>
        BAD_EVENTS[e.last_event]
          ? e.to
              .filter((to) => mine.has(to.toLowerCase()))
              .map((to) => ({ email: to, problem: BAD_EVENTS[e.last_event], at: e.created_at, subject: e.subject }))
          : [],
      ),
    ];
    return { problems: problems.sort((a, b) => b.at.localeCompare(a.at)), error: null };
  } catch (e) {
    return { problems: [], error: (e as Error).message };
  }
}

// Everyone in the agency's addresses, for matching against Resend.
export async function agencyEmails(admin: SupabaseClient, agencyId: string): Promise<string[]> {
  const { data: members } = await admin
    .from("memberships")
    .select("user:users!memberships_user_id_fkey(email)")
    .eq("agency_id", agencyId)
    .is("removed_permanently_at", null);
  return ((members ?? []) as unknown as { user: { email: string } | null }[])
    .map((m) => m.user?.email)
    .filter((e): e is string => !!e);
}
