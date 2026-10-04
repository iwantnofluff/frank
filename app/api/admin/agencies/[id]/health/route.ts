import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin/require-platform-admin";
import { agencyEmails, loadAgencyBilling, loadEmailProblems } from "@/lib/admin/agency-health";

// One agency's billing (our record and Paddle's recent payments) and its
// people's email problems (Resend). Read-only.
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth) return auth.error;
  const { admin } = auth;
  const { id } = await ctx.params;
  const [billing, email] = await Promise.all([
    loadAgencyBilling(admin, id),
    agencyEmails(admin, id).then(loadEmailProblems),
  ]);
  return NextResponse.json({ billing, email });
}
