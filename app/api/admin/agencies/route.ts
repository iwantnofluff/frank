import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin/require-platform-admin";
import { createInviteToken } from "@/lib/invites/token";
import { INVITE_TTL_MS } from "@/lib/invites/constants";
import { inviteEmail } from "@/lib/email/invite-email";
import { planById } from "@/lib/plans";
import { addressError } from "@/lib/address";
import { sendEmail } from "@/lib/email/send-email";
import { agencyOrigin } from "@/lib/admin/agency-origin";

const count = (rows: { agency_id: string }[] | null, id: string) => (rows ?? []).filter((r) => r.agency_id === id).length;

// Every agency, with its usage (phase37's first admin view).
export async function GET() {
  const auth = await requirePlatformAdmin();
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [agencies, staff, clients, posts, ai, owners, requests, billing] = await Promise.all([
    admin
      .from("agencies")
      .select("id, name, subdomain, plan, seat_limit, client_limit, storage_limit_bytes, trial_ends_at, ai_monthly_request_cap, extra_seats, extra_clients, extra_ai_requests, extra_storage_bytes, created_at, suspended_at, archived_at")
      .order("created_at"),
    admin.from("memberships").select("agency_id").is("client_id", null).is("removed_at", null),
    admin.from("clients").select("agency_id").is("archived_at", null),
    admin.from("creatives").select("agency_id").is("archived_at", null),
    admin.from("ai_usage_events").select("agency_id").gte("created_at", monthStart.toISOString()),
    // Not embedded: memberships point at users twice (the member, and who
    // invited them), which leaves an embed ambiguous — it came back empty.
    admin.from("memberships").select("agency_id, user_id").eq("role", "primary_owner").is("removed_at", null),
    admin
      .from("plan_requests")
      .select("id, agency_id, requested_plan, billing_interval, created_at")
      .is("handled_at", null)
      .order("created_at", { ascending: false }),
    admin.from("agency_billing").select("agency_id, paddle_subscription_id, status"),
  ]);
  const ownerIds = [...new Set((owners.data ?? []).map((o) => o.user_id as string))];
  const { data: ownerUsers } = ownerIds.length
    ? await admin.from("users").select("id, name, email").in("id", ownerIds)
    : { data: [] as { id: string; name: string; email: string }[] };
  if (agencies.error) return NextResponse.json({ error: agencies.error.message }, { status: 500 });

  // What each agency has stored, as its storage limit counts it (phase41):
  // the files themselves, not what the assets table says about them.
  const live = (agencies.data ?? []).filter((a) => !a.archived_at);
  const stored = await Promise.all(
    live.map((a) => admin.rpc("agency_storage_used", { check_agency_id: a.id }).then((r) => Number(r.data ?? 0))),
  );
  const rows = live
    .map((a, i) => {
      const ownerId = (owners.data ?? []).find((o) => o.agency_id === a.id)?.user_id;
      const owner = (ownerUsers ?? []).find((u) => u.id === ownerId) ?? null;
      return {
        ...a,
        owner: owner ? { name: owner.name, email: owner.email } : null,
        members: count(staff.data, a.id),
        clients: count(clients.data, a.id),
        posts: count(posts.data, a.id),
        storage_bytes: stored[i],
        pays_by_card: (billing.data ?? []).some(
          (b) => b.agency_id === a.id && !!b.paddle_subscription_id && b.status !== "canceled",
        ),
        ai_this_month: count(ai.data, a.id),
        pending_request: (() => {
          const r = (requests.data ?? []).find((x) => x.agency_id === a.id);
          return r ? { id: r.id, plan: r.requested_plan, interval: r.billing_interval, created_at: r.created_at } : null;
        })(),
      };
    });
  // Deleting outright is staging's alone (ALLOW_AGENCY_DELETE).
  const canDelete = process.env.ALLOW_AGENCY_DELETE === "true";
  return NextResponse.json({ agencies: rows.map((r) => ({ ...r, can_delete: canDelete })) });
}

// A new agency, with its Primary Owner invited to its own address.
export async function POST(request: Request) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth) return auth.error;
  const { admin, user } = auth;

  let body: { name?: string; subdomain?: string; ownerEmail?: string; plan?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const name = body.name?.trim();
  const subdomain = body.subdomain?.trim().toLowerCase();
  const email = body.ownerEmail?.trim().toLowerCase();
  if (!name || !subdomain || !email) {
    return NextResponse.json({ error: "Name, address and the owner's email are all needed." }, { status: 400 });
  }
  // Decided directly: the admin picks the plan, Free unless they say
  // otherwise. Free's 30-day trial starts now (the column's default).
  const tier = planById(body.plan ?? "free");
  if (!tier) return NextResponse.json({ error: "Unknown plan" }, { status: 400 });

  const { data: agency, error: agencyError } = await admin
    .from("agencies")
    .insert({ name, subdomain, plan: tier.id })
    .select("id")
    .single();
  if (agencyError || !agency) {
    const msg = agencyError?.message ?? "";
    return NextResponse.json({ error: addressError(msg) ?? (msg || "Couldn't create the agency") }, { status: 400 });
  }

  // Undo the agency if the owner can't be set up, rather than leave one
  // with no Primary Owner.
  const undo = async (userIdToRemove?: string) => {
    await admin.from("memberships").delete().eq("agency_id", agency.id);
    await admin.from("agencies").delete().eq("id", agency.id);
    if (userIdToRemove) {
      await admin.from("users").delete().eq("id", userIdToRemove);
      await admin.auth.admin.deleteUser(userIdToRemove);
    }
  };

  const { data: existing } = await admin.from("users").select("id").eq("email", email).maybeSingle();
  let userId = existing?.id as string | undefined;
  let createdUser = false;
  if (!userId) {
    const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (error || !created.user) {
      await undo();
      return NextResponse.json({ error: error?.message ?? "Couldn't create the owner's account" }, { status: 500 });
    }
    userId = created.user.id;
    createdUser = true;
    const { error: userError } = await admin.from("users").insert({ id: userId, email, name: email.split("@")[0] });
    if (userError) {
      await undo(userId);
      return NextResponse.json({ error: userError.message }, { status: 500 });
    }
  }

  const { data: membership, error: membershipError } = await admin
    .from("memberships")
    // accepted_at defaults to now(); the owner hasn't accepted yet.
    .insert({
      agency_id: agency.id,
      user_id: userId,
      role: "primary_owner",
      invited_at: new Date().toISOString(),
      accepted_at: null,
    })
    .select("id")
    .single();
  if (membershipError || !membership) {
    await undo(createdUser ? userId : undefined);
    return NextResponse.json({ error: membershipError?.message ?? "Couldn't add the owner" }, { status: 500 });
  }

  const { token, tokenHash } = createInviteToken();
  const { error: inviteError } = await admin.from("invites").insert({
    membership_id: membership.id,
    token_hash: tokenHash,
    expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
    created_by: user.id,
  });
  if (inviteError) {
    await undo(createdUser ? userId : undefined);
    return NextResponse.json({ error: inviteError.message }, { status: 500 });
  }

  // The invite opens on the new agency's own address.
  const url = `${agencyOrigin(request, subdomain)}/invite/${token}`;
  try {
    await sendEmail({
      to: email,
      ...inviteEmail({ agencyName: name, inviterName: "Frank", roleLabel: "Primary Owner", url }),
    });
  } catch (e) {
    return NextResponse.json(
      { agencyId: agency.id, warning: `The agency was created, but the invite email didn't send. ${(e as Error).message}` },
      { status: 201 },
    );
  }
  return NextResponse.json({ agencyId: agency.id }, { status: 201 });
}
