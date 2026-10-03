import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { verifyPaddleSignature } from "@/lib/billing/paddle";
import { applySubscription } from "@/lib/billing/apply-subscription";
import type { PaddleSubscription } from "@/lib/billing/rules";
import { emailPlatformAdmins } from "@/lib/admin/email-platform-admins";
import { planById } from "@/lib/plans";

// Paddle's notifications (phase39) — the only thing that changes an
// agency's plan after a payment. Public (no session); trusted only once
// Paddle's signature checks out. Answering anything but 2xx makes Paddle
// retry, which is what a failure here should do.
export async function POST(request: Request) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 500 });

  const raw = await request.text();
  if (!verifyPaddleSignature(raw, request.headers.get("paddle-signature"), secret)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 });
  }
  let event: { event_id: string; event_type: string; occurred_at: string; data: unknown };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  const { data: seen } = await admin.from("paddle_events").select("event_id").eq("event_id", event.event_id).maybeSingle();
  if (seen) return NextResponse.json({ ok: true, duplicate: true });

  // Every subscription.* event carries the whole subscription; anything
  // else (transactions) is Paddle's business — receipts, retries — not ours.
  if (event.event_type.startsWith("subscription.")) {
    const sub = event.data as PaddleSubscription;
    const result = await applySubscription(admin, sub, event.occurred_at);
    if (result.outcome === "conflict") {
      await emailPlatformAdmins(
        admin,
        "An agency has two Paddle subscriptions",
        `Agency ${result.agencyId} already pays through Paddle, and subscription ${sub.id} was started for it too. Frank kept the first; cancel or refund the second in Paddle.`,
      );
    }
    if (result.outcome === "applied" && result.planChanged) {
      const { data: agency } = await admin.from("agencies").select("name").eq("id", result.agencyId).single();
      const name = agency?.name ?? "An agency";
      const was = planById(result.previousPlan)?.name ?? result.previousPlan;
      const now = planById(result.plan)?.name ?? result.plan;
      await emailPlatformAdmins(admin, `${name} moved from ${was} to ${now}`, `${name} is now on ${now} (was ${was}), through Paddle.`);
    }
  }

  const { error } = await admin
    .from("paddle_events")
    .insert({ event_id: event.event_id, event_type: event.event_type, occurred_at: event.occurred_at });
  // Two deliveries at once: the other one recorded it.
  if (error && error.code !== "23505") throw error;
  return NextResponse.json({ ok: true });
}
