import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAiTask } from "@/lib/ai/run-ai-task";
import { FORMATS } from "@/lib/formats";
import { buildVoicePostPrompt, parseVoicePost } from "@/lib/ai/voice-post";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// A post made by speaking (direct instruction): what the browser heard,
// turned into the New Post window's fields by one request against the
// agency's monthly cap (runAiTask). The team only. Nothing is saved: the
// fields go back to the window, to be checked before Create Post. The team
// and formats are read here, not taken from the request, so the reply can
// only name real ones.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { agencyId?: string; projectId?: string; transcript?: string; delivery?: string; today?: string; weekday?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { agencyId, projectId, transcript, delivery, today, weekday } = body;
  if (!agencyId || !projectId || !transcript?.trim() || !today || !DATE.test(today)) {
    return NextResponse.json({ error: "agencyId, projectId, transcript and today are required" }, { status: 400 });
  }
  if (transcript.length > 4000) {
    return NextResponse.json({ error: "That's a lot to take in at once. Try saying it more briefly." }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("client_id")
    .eq("agency_id", agencyId)
    .eq("user_id", user.id)
    .is("removed_at", null)
    .maybeSingle();
  if (!membership || membership.client_id !== null) {
    return NextResponse.json({ error: "Staff access required" }, { status: 403 });
  }

  // The project's team, as the window's Team picker offers them (direct
  // instruction: only they can be put on its posts; phase107).
  const { data: projectTeam, error: projectTeamError } = await supabase.rpc("project_team_user_ids", { p_project_id: projectId });
  if (projectTeamError) return NextResponse.json({ error: "Couldn't load the team" }, { status: 500 });
  const onProject = new Set((projectTeam ?? []) as string[]);
  const { data: people, error: peopleError } = await supabase
    .from("memberships")
    .select("user_id, user:users!memberships_user_id_fkey(name, email)")
    .eq("agency_id", agencyId)
    .is("client_id", null)
    .is("removed_at", null)
    .not("accepted_at", "is", null);
  if (peopleError) return NextResponse.json({ error: "Couldn't load the team" }, { status: 500 });
  const team = (people ?? []).filter((p) => onProject.has(p.user_id as string)).map((p) => {
    const u = p.user as unknown as { name: string | null; email: string } | null;
    return { id: p.user_id as string, name: u?.name || u?.email || "" };
  });
  const formats = FORMATS.map((f) => ({ id: f.id, label: f.label }));

  const prompt = buildVoicePostPrompt({
    transcript,
    today,
    weekday: weekday || "",
    delivery: delivery === "continuous" ? "continuous" : "scheduled",
    formats,
    team,
  });
  const result = await runAiTask(supabase, agencyId, user.id, prompt);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const fields = parseVoicePost(result.text ?? "", {
    formatIds: new Set(formats.map((f) => f.id)),
    teamIds: new Set(team.map((t) => t.id)),
  });
  return NextResponse.json({ fields });
}
