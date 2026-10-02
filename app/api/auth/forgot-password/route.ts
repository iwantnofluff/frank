import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@/lib/supabase/server";
import { resetPasswordEmail } from "@/lib/email/reset-password-email";
import { sendEmail } from "@/lib/email/send-email";
import { tenantFromHost } from "@/lib/tenant";

// "Forgot password?" (phase37 — needed for the admin account's first
// password, and missing for everyone). A one-time recovery token from
// Supabase is put in a link to this same address's /reset-password, and
// sent through Resend like every other Frank email. The answer is the same
// whether or not the account exists, so this can't be used to find out
// who has one.
export async function POST(request: Request) {
  let email: string | undefined;
  try {
    ({ email } = await request.json());
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  email = email?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Enter your email" }, { status: 400 });

  const admin = createServiceRoleClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
  const tokenHash = data?.properties?.hashed_token;
  if (!error && tokenHash) {
    const tenant = tenantFromHost((await headers()).get("host"));
    let workspaceName: string | null = null;
    if (tenant.kind === "agency") {
      const { data: ws } = await (await createClient()).rpc("workspace_for_subdomain", { p_subdomain: tenant.subdomain });
      workspaceName = (ws as { name: string }[] | null)?.[0]?.name ?? null;
    } else if (tenant.kind === "admin") {
      workspaceName = "Frank Admin";
    }
    const url = `${new URL(request.url).origin}/reset-password?token_hash=${encodeURIComponent(tokenHash)}`;
    try {
      await sendEmail({ to: email, ...resetPasswordEmail({ url, workspaceName }) });
    } catch {
      // Same answer either way; the person can try again.
    }
  }
  return NextResponse.json({ ok: true });
}
