import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { postMessage, SlackError } from "@/lib/slack/api";
import { PROBLEMS } from "@/lib/slack/deliver";
import { slackCheckMessage } from "@/lib/slack/message";
import { decryptSlackToken } from "@/lib/slack/secrets";
import { agencyOrigin } from "@/lib/admin/agency-origin";
import { monthLabel } from "@/lib/monthly-strategy";
import { VERDICT_LABELS, type MonthReview } from "@/lib/month-review";
import type { CheckFinding } from "@/lib/ai/build-check-prompt";

const MAX_POINTS = 5;

// Share to Slack (phase174, direct instruction): a saved Check Brand or
// Check the Month, posted to the post's project's channel, naming the post
// and linking to the saved check in its Edit window. The team's only; what's
// shared is read as the caller (so only what they can see), and only the
// workspace's Slack token and the project's channel through the service
// role, as delivery does.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { creativeId?: string; kind?: string; month?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const kind = body.kind === "brand" || body.kind === "month" ? body.kind : null;
  const month = body.month?.match(/^\d{4}-\d{2}-01$/)?.[0] ?? null;
  if (!body.creativeId || !kind || (kind === "month" && !month)) {
    return NextResponse.json({ error: "A post, a check and (for the month) a month are required" }, { status: 400 });
  }

  const { data: post } = await supabase
    .from("creatives")
    .select("id, name, agency_id, project_id, projects(name, clients(name))")
    .eq("id", body.creativeId)
    .maybeSingle();
  if (!post) return NextResponse.json({ error: "This post isn't available" }, { status: 404 });
  const { data: membership } = await supabase
    .from("memberships")
    .select("client_id")
    .eq("agency_id", post.agency_id)
    .eq("user_id", user.id)
    .is("removed_at", null)
    .maybeSingle();
  if (!membership || membership.client_id !== null) {
    return NextResponse.json({ error: "Staff access required" }, { status: 403 });
  }

  // The saved check, as the caller sees it.
  let checkName: string;
  let lead: string | null = null;
  let points: string[];
  if (kind === "brand") {
    const { data } = await supabase.from("brand_checks").select("findings").eq("creative_id", post.id).maybeSingle();
    if (!data) return NextResponse.json({ error: "Save the check first, then share it" }, { status: 409 });
    const findings = (data.findings ?? []) as CheckFinding[];
    const toFix = findings.filter((f) => f.tone === "warn");
    checkName = "Check Brand";
    lead = toFix.length ? `${toFix.length} to look at` : "Nothing to fix: it fits the brand";
    points = toFix.map((f) => `${f.title}: ${f.body}`);
  } else {
    const { data } = await supabase.from("month_reviews").select("review").eq("project_id", post.project_id).eq("month", month!).maybeSingle();
    if (!data) return NextResponse.json({ error: "Save the review first, then share it" }, { status: 409 });
    const review = data.review as MonthReview;
    checkName = `Check the Month (${monthLabel(month!)})`;
    lead = `${VERDICT_LABELS[review.verdict] ?? review.verdict}: ${review.summary}`;
    points = [...(review.strategyMissing ?? []), ...(review.brandGaps ?? []), ...(review.suggestions ?? [])];
  }

  const admin = createServiceRoleClient();
  const [conn, channel, agency, me] = await Promise.all([
    admin.from("slack_connections").select("bot_token_enc").eq("agency_id", post.agency_id).maybeSingle(),
    admin.from("project_slack").select("channel_id, channel_name").eq("project_id", post.project_id).maybeSingle(),
    admin.from("agencies").select("subdomain").eq("id", post.agency_id).maybeSingle(),
    supabase.from("users").select("name").eq("id", user.id).maybeSingle(),
  ]);
  if (!conn.data) return NextResponse.json({ error: "Connect Slack in Settings → Connections → Slack first" }, { status: 409 });
  if (!channel.data) return NextResponse.json({ error: "This project has no Slack channel. Pick one in the project's Settings." }, { status: 409 });

  const project = post.projects as { name?: string; clients?: { name?: string } | null } | null;
  const subdomain = (agency.data?.subdomain as string | null) ?? null;
  const origin = subdomain ? agencyOrigin(request, subdomain) : new URL(request.url).origin;
  const link = new URL(`/creatives/${post.id}`, origin);
  link.searchParams.set("edit", "checks");
  link.searchParams.set("check", kind);
  if (month) link.searchParams.set("month", month);

  const message = slackCheckMessage({
    who: (me.data?.name as string | undefined) ?? "Someone on the team",
    checkName,
    postName: (post.name as string) || "Untitled",
    projectName: project?.name ?? "",
    clientName: project?.clients?.name ?? null,
    lead,
    points: points.slice(0, MAX_POINTS),
    more: Math.max(0, points.length - MAX_POINTS),
    url: link.toString(),
  });
  try {
    await postMessage(decryptSlackToken(conn.data.bot_token_enc as string), channel.data.channel_id as string, message);
  } catch (e) {
    const code = e instanceof SlackError ? e.code : "send_failed";
    return NextResponse.json({ error: PROBLEMS[code] ?? `Slack said: ${code}` }, { status: 502 });
  }
  return NextResponse.json({ channel: (channel.data.channel_name as string | null) ?? null });
}
