import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { agencyOrigin } from "@/lib/admin/agency-origin";
import { sendEmail } from "@/lib/email/send-email";
import { clientActivityEmail } from "@/lib/email/client-activity-email";

// Sends the emails a client's comment or approval is owed (phase80). The
// database decided who, by the client's Preferences, when it wrote the
// notices (notify_client_activity); this only sends the ones marked for
// email and not sent yet, from the last day, about the post named, then
// records it. Called straight after the client acts, by whichever page they
// acted on (a review link has no session, so it's open); asking again sends
// nothing twice, and nothing about the request decides who gets mail.
export async function POST(request: Request) {
  const { creativeId } = (await request.json().catch(() => ({}))) as { creativeId?: string };
  if (!creativeId) return NextResponse.json({ error: "creativeId is required" }, { status: 400 });

  const admin = createServiceRoleClient();
  // Claimed first, so two requests can't both send one.
  const { data: owed, error } = await admin
    .from("notifications")
    .update({ emailed_at: new Date().toISOString() })
    .eq("creative_id", creativeId)
    .eq("email_due", true)
    .is("emailed_at", null)
    .gte("created_at", new Date(Date.now() - 24 * 3600e3).toISOString())
    .select("id, kind, user_id, comment_id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!owed?.length) return NextResponse.json({ sent: 0 });

  const { data: post } = await admin
    .from("creatives")
    .select("id, name, approved_by_name, project:projects(client:clients(name), agency:agencies(subdomain))")
    .eq("id", creativeId)
    .single();
  const project = post?.project as unknown as { client: { name: string } | null; agency: { subdomain: string | null } | null } | null;
  const userIds = [...new Set(owed.map((n) => n.user_id as string))];
  const commentIds = [...new Set(owed.map((n) => n.comment_id as string | null).filter((id): id is string => !!id))];
  const [{ data: users }, { data: comments }] = await Promise.all([
    admin.from("users").select("id, email").in("id", userIds),
    commentIds.length ? admin.from("comments").select("id, body, guest_name, author_id").in("id", commentIds) : Promise.resolve({ data: [] }),
  ]);
  const authorIds = (comments ?? []).map((c) => c.author_id as string | null).filter((id): id is string => !!id);
  const { data: authors } = authorIds.length ? await admin.from("users").select("id, name").in("id", authorIds) : { data: [] };
  const emailOf = new Map((users ?? []).map((u) => [u.id as string, u.email as string]));
  const nameOf = new Map((authors ?? []).map((u) => [u.id as string, u.name as string]));
  const commentOf = new Map((comments ?? []).map((c) => [c.id as string, c]));

  const subdomain = project?.agency?.subdomain;
  const base = subdomain ? agencyOrigin(request, subdomain) : new URL(request.url).origin;
  let sent = 0;
  for (const n of owed) {
    const to = emailOf.get(n.user_id as string);
    if (!to) continue;
    const c = n.comment_id ? commentOf.get(n.comment_id as string) : null;
    const who = c
      ? ((c.guest_name as string | null) ?? nameOf.get(c.author_id as string) ?? "The client")
      : ((post?.approved_by_name as string | null) ?? "The client");
    try {
      await sendEmail({
        to,
        ...clientActivityEmail({
          kind: n.kind as "client_comment" | "client_approval",
          who,
          postName: (post?.name as string) ?? "A post",
          clientName: project?.client?.name ?? "Your client",
          comment: (c?.body as string | undefined) ?? null,
          url: `${base}/creatives/${creativeId}`,
        }),
      });
      sent++;
    } catch {
      // Not sent: let it go again next time.
      await admin.from("notifications").update({ emailed_at: null }).eq("id", n.id);
    }
  }
  return NextResponse.json({ sent });
}
