import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { agencyOrigin } from "@/lib/admin/agency-origin";
import { yourAddressesEmail } from "@/lib/email/confirm-signup-email";
import { sendEmail } from "@/lib/email/send-email";

// "Forgot your address?" on beingfrank.app (phase42): emails the addresses
// of every agency the person belongs to. The answer is the same whether or
// not the email has an account, so it can't be used to find out who does.
export async function POST(request: Request) {
  const { email: raw } = (await request.json().catch(() => ({}))) as { email?: string };
  const email = raw?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Enter your email" }, { status: 400 });
  const admin = createServiceRoleClient();
  const { data: user } = await admin.from("users").select("id").eq("email", email).maybeSingle();
  if (user) {
    const { data: rows } = await admin
      .from("memberships")
      .select("agencies(name, subdomain, archived_at)")
      .eq("user_id", user.id)
      .is("removed_at", null)
      .not("accepted_at", "is", null);
    const addresses = (rows ?? [])
      .map((r) => r.agencies as unknown as { name: string; subdomain: string | null; archived_at: string | null } | null)
      .filter((a): a is { name: string; subdomain: string; archived_at: null } => !!a?.subdomain && !a.archived_at)
      .map((a) => ({ name: a.name, url: agencyOrigin(request, a.subdomain) }));
    if (addresses.length) {
      try {
        await sendEmail({ to: email, ...yourAddressesEmail({ addresses }) });
      } catch {
        // Same answer either way; they can ask again.
      }
    }
  }
  return NextResponse.json({ ok: true });
}
