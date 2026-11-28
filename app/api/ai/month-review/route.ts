import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAiTask } from "@/lib/ai/run-ai-task";
import { KNOWLEDGE_SECTIONS, isPendingNote } from "@/lib/knowledge-sections";
import { filledFields, monthLabel } from "@/lib/monthly-strategy";
import { copySummary, formatsLabel, postFormats } from "@/lib/formats";
import { goLiveDay } from "@/lib/post-live";
import { stageLabel } from "@/lib/stage-labels";
import { inMonth, monthReviewPrompt, parseMonthReview, type MonthReviewPost } from "@/lib/month-review";

const SECTION_LABELS: Record<string, string> = Object.fromEntries(KNOWLEDGE_SECTIONS.map((s) => [s.key, s.label]));
// The most posts sent, so one request stays predictable against the cap.
const MAX_POSTS = 60;

type Row = Record<string, unknown>;

// Check the Month (phase173, direct instruction): Frank's review of a
// project's posts for one month, as a whole, against the client's Knowledge
// (not notes still reading Pending) and the month's strategy. The team's
// only. One call through runAiTask (task month_review), so the monthly limit
// and usage log apply. Everything is read here, as the caller, never taken
// from the page; the review is saved over the last one for that month.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { projectId?: string; month?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const month = body.month?.match(/^\d{4}-\d{2}-01$/)?.[0] ?? null;
  if (!body.projectId || !month) return NextResponse.json({ error: "projectId and a month are required" }, { status: 400 });

  // Read as the caller: RLS decides whether they can see it at all.
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, agency_id, client_id, delivery, clients(name)")
    .eq("id", body.projectId)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "This project isn't available" }, { status: 404 });
  const { data: membership } = await supabase
    .from("memberships")
    .select("client_id")
    .eq("agency_id", project.agency_id)
    .eq("user_id", user.id)
    .is("removed_at", null)
    .maybeSingle();
  if (!membership || membership.client_id !== null) {
    return NextResponse.json({ error: "Staff access required" }, { status: 403 });
  }

  const [creatives, hidden, knowledge, strategy, prefs] = await Promise.all([
    supabase
      .from("creatives")
      .select("id, name, stage, format, formats, scheduled_at, due_on, publish_on, concept, slide_text, voiceover, status_id, updated_at")
      .eq("project_id", project.id)
      .is("archived_at", null),
    supabase.from("stage_statuses").select("id").eq("hides_post", true),
    supabase.from("knowledge_entries").select("section, kind, title, body").eq("client_id", project.client_id).eq("kind", "text").order("created_at"),
    supabase
      .from("client_monthly_strategies")
      .select("objective, key_messages, themes, offers, key_dates, notes")
      .eq("client_id", project.client_id)
      .eq("month", month)
      .maybeSingle(),
    supabase.from("client_preferences").select("contracted_posts_per_month").eq("client_id", project.client_id).maybeSingle(),
  ]);
  if (creatives.error || knowledge.error) {
    return NextResponse.json({ error: "Couldn't load this month's posts" }, { status: 500 });
  }

  // The month's posts, by the day each goes live; not one on a status that
  // hides it (Cancelled), nor an Idea (it has no day).
  const hiddenIds = new Set((hidden.data ?? []).map((s) => s.id as string));
  const dayOf = (c: Row) => ((c.scheduled_at as string | null)?.slice(0, 10) ?? goLiveDay(c as { due_on?: string | null; publish_on?: string | null }));
  const monthPosts = (creatives.data ?? [])
    .filter((c) => inMonth(dayOf(c), month) && !(c.status_id && hiddenIds.has(c.status_id as string)))
    .sort((a, b) => (dayOf(a) ?? "").localeCompare(dayOf(b) ?? ""))
    .slice(0, MAX_POSTS);

  // Each post's latest copy.
  const ids = monthPosts.map((c) => c.id as string);
  const { data: copies } = ids.length
    ? await supabase.from("copy_versions").select("creative_id, version_no, fields").in("creative_id", ids).order("version_no", { ascending: false })
    : { data: [] as Row[] };
  const latestCopy = new Map<string, Record<string, string>>();
  for (const v of copies ?? []) {
    if (!latestCopy.has(v.creative_id as string)) latestCopy.set(v.creative_id as string, (v.fields ?? {}) as Record<string, string>);
  }

  const delivery = project.delivery === "continuous" ? "continuous" : "scheduled";
  const posts: MonthReviewPost[] = monthPosts.map((c) => {
    const formats = postFormats(c as { format: string | null; formats?: string[] | null });
    const fields = latestCopy.get(c.id as string);
    const slides = ((c.slide_text as string[] | null) ?? []).filter((t) => t?.trim());
    return {
      date: dayOf(c) ?? "",
      name: (c.name as string) || "Untitled",
      stage: stageLabel(c.stage as number, delivery),
      formats: formats.length ? formatsLabel(formats) : "No format yet",
      concept: (c.concept as string | null)?.trim() || null,
      copy: fields ? copySummary(fields, formats) || null : null,
      textOnImage: slides.length ? slides.join(" · ") : null,
      voiceover: (c.voiceover as string | null)?.trim() || null,
    };
  });

  const clientName = (project.clients as { name?: string } | null)?.name ?? "the client";
  const prompt = monthReviewPrompt({
    clientName,
    projectName: project.name as string,
    monthLabel: monthLabel(month),
    knowledge: (knowledge.data ?? [])
      .filter((k) => k.body?.trim() && !isPendingNote(k))
      .map((k) => ({ section: SECTION_LABELS[k.section as string] ?? (k.section as string), title: (k.title as string) ?? "", body: k.body as string })),
    // The month's filled fields, as written (strategyForPrompt speaks of
    // one post).
    strategy: filledFields(strategy.data).map((f) => `${f.label}: ${f.value}`).join("\n") || null,
    contractedPosts: (prefs.data?.contracted_posts_per_month as number | null) ?? null,
    posts,
  });

  const result = await runAiTask(supabase, project.agency_id as string, user.id, "month_review", prompt);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const review = parseMonthReview(result.text ?? "");
  if (!review) return NextResponse.json({ error: "Frank's review didn't come back in a form it could show. Try again." }, { status: 502 });

  // The posts as they were, so the window can say when they've changed.
  const postsAt = monthPosts.reduce<string | null>((m, c) => {
    const at = c.updated_at as string | null;
    return at && (!m || at > m) ? at : m;
  }, null);
  const { data: saved, error: saveError } = await supabase
    .from("month_reviews")
    .upsert(
      {
        project_id: project.id,
        month,
        review,
        posts_at: postsAt,
        post_count: monthPosts.length,
        created_by: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id,month" },
    )
    .select("id, project_id, month, review, posts_at, post_count, created_by, updated_at")
    .maybeSingle();
  if (saveError || !saved) return NextResponse.json({ error: "Couldn't save the review" }, { status: 500 });
  return NextResponse.json(saved);
}
