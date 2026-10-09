import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { addressProblem } from "@/lib/address-check";
import { addressError } from "@/lib/address";
import { agencyOrigin } from "@/lib/admin/agency-origin";
import { MIN_PASSWORD_LENGTH } from "@/lib/invites/constants";
import { confirmSignupEmail } from "@/lib/email/confirm-signup-email";
import { sendEmail } from "@/lib/email/send-email";
import { emailPlatformAdmins } from "@/lib/admin/email-platform-admins";

// An agency signs itself up (phase42; decided directly: this is how Frank
// gets its agencies). It starts on Free with its 30-day trial, the person
// signing up as its Primary Owner. Their account can't sign in until they
// confirm the email: Supabase makes the confirmation token without sending
// anything (generateLink), and Frank emails it through Resend, like
// invites and password resets. The link opens the agency's own address.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    agencyName?: string;
    subdomain?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    password?: string;
  };
  const agencyName = body.agencyName?.trim() ?? "";
  const subdomain = body.subdomain?.trim().toLowerCase() ?? "";
  const firstName = body.firstName?.trim() ?? "";
  const lastName = body.lastName?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });
  if (!agencyName) return fail("Enter your workspace's name");
  if (!firstName) return fail("Enter your first name");
  if (!lastName) return fail("Enter your last name");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter your email");
  if (password.length < MIN_PASSWORD_LENGTH) return fail(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password`);

  const admin = createServiceRoleClient();
  const problem = await addressProblem(admin, subdomain);
  if (problem) return fail(problem);
  // One agency per person for now (the app assumes it: useMyAgency).
  const { data: existing } = await admin.from("users").select("id").eq("email", email).maybeSingle();
  if (existing) return fail("That email already uses Frank. Sign in instead, or use another email.", 409);

  // Free, with Free's limits and trial (the database's defaults, phase41/42).
  const { data: agency, error: agencyError } = await admin
    .from("agencies")
    .insert({ name: agencyName, subdomain })
    .select("id")
    .single();
  if (agencyError || !agency) {
    const msg = agencyError?.message ?? "";
    return fail(addressError(msg) ?? "Couldn't create your workspace", addressError(msg) ? 400 : 500);
  }
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "signup", email, password });
  const userId = link?.user?.id;
  // Anything half made goes, so the address and the email are free again.
  const undo = async () => {
    await admin.from("memberships").delete().eq("agency_id", agency.id);
    await admin.from("agencies").delete().eq("id", agency.id);
    if (userId) {
      await admin.from("users").delete().eq("id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  };
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !userId || !tokenHash) {
    await undo();
    const taken = linkError?.message.toLowerCase().includes("already");
    return fail(taken ? "That email already uses Frank. Sign in instead, or use another email." : "Couldn't create your account", taken ? 409 : 500);
  }
  // Title case and users.name come from the users_normalise_profile trigger.
  const { error: userError } = await admin
    .from("users")
    .insert({ id: userId, email, name: `${firstName} ${lastName}`, first_name: firstName, last_name: lastName });
  const { error: memberError } = userError
    ? { error: userError }
    : await admin.from("memberships").insert({
        agency_id: agency.id,
        user_id: userId,
        role: "primary_owner",
        accepted_at: new Date().toISOString(),
      });
  if (userError || memberError) {
    await undo();
    return fail((userError ?? memberError)!.message, 500);
  }

  const origin = agencyOrigin(request, subdomain);
  const url = `${origin}/confirm?token_hash=${encodeURIComponent(tokenHash)}`;
  try {
    await sendEmail({ to: email, ...confirmSignupEmail({ url, agencyName, address: origin.replace(/^https?:\/\//, "") }) });
  } catch {
    await undo();
    return fail("We couldn't send the confirmation email. Check the address and try again.", 502);
  }
  await emailPlatformAdmins(admin, "signups", `${agencyName} signed up`, `${agencyName} signed up at ${origin.replace(/^https?:\/\//, "")}, on Free, by ${firstName} ${lastName} (${email}).`);
  return NextResponse.json({ address: origin.replace(/^https?:\/\//, "") }, { status: 201 });
}
