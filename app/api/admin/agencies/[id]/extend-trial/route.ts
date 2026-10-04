import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin/require-platform-admin";
import { REASON_REQUIRED, logAction, reasonFrom } from "@/lib/admin/actions";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const DAY = 24 * 3600_000;

// The admin extends an agency's free trial (phase51): from its end, or from
// today if it's already over (lifting read-only). Logged.
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth) return auth.error;
  const { admin, user } = auth;
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const reason = reasonFrom(body);
  if (!reason) return fail(REASON_REQUIRED, 400);
  const days = Number(body.days);
  if (!Number.isInteger(days) || days < 1 || days > 90) return fail("Extend by 1 to 90 days", 400);

  const { data: agency } = await admin.from("agencies").select("plan, trial_ends_at").eq("id", id).maybeSingle();
  if (!agency) return fail("Agency not found", 404);
  if (agency.plan !== "free") return fail("Only an agency on Free has a trial", 409);
  const from = Math.max(Date.now(), agency.trial_ends_at ? new Date(agency.trial_ends_at as string).getTime() : 0);
  const endsAt = new Date(from + days * DAY).toISOString();
  const { error } = await admin.from("agencies").update({ trial_ends_at: endsAt }).eq("id", id);
  if (error) return fail(error.message, 500);

  try {
    await logAction(admin, user, {
      agencyId: id,
      action: "Extended the free trial",
      detail: `By ${days} day${days === 1 ? "" : "s"}, to ${new Date(endsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`,
      reason,
    });
  } catch (e) {
    return fail((e as Error).message, 500);
  }
  return NextResponse.json({ trialEndsAt: endsAt });
}
