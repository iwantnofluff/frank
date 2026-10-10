import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runAiTask } from "@/lib/ai/run-ai-task";
import {
  OVERVIEW_SECTIONS,
  monthSection,
  monthSource,
  monthWhat,
  overviewHash,
  overviewPrompt,
  sectionSource,
  type OverviewSection,
} from "@/lib/strategy-overview";

// A Strategy box's overview on a client's page (phase83, decided directly):
// rewritten only when what it's written from has changed since the last
// one. That's read here, server-side, never taken from the page, so the
// overview can't drift from what's really in the client's Knowledge. The
// team only; the page calls it the first time someone on the team opens
// the client after a change.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: { clientId?: string; section?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { clientId, section } = body;
  const month = section?.match(/^month:(\d{4}-\d{2}-01)$/)?.[1] ?? null;
  if (!clientId || !section || (!month && !(section in OVERVIEW_SECTIONS))) {
    return NextResponse.json({ error: "clientId and a section are required" }, { status: 400 });
  }

  const { data: client } = await supabase.from("clients").select("agency_id, name").eq("id", clientId).maybeSingle();
  if (!client) {
    return NextResponse.json({ error: "Couldn't load this client" }, { status: 404 });
  }
  const { data: membership } = await supabase
    .from("memberships")
    .select("client_id")
    .eq("agency_id", client.agency_id)
    .eq("user_id", user.id)
    .is("removed_at", null)
    .maybeSingle();
  if (!membership || membership.client_id !== null) {
    return NextResponse.json({ error: "Staff access required" }, { status: 403 });
  }

  // What the box is written from, as it is now.
  let source: string;
  let what: string;
  if (month) {
    const { data: row, error } = await supabase
      .from("client_monthly_strategies")
      .select("objective, key_messages, themes, offers, key_dates, notes")
      .eq("client_id", clientId)
      .eq("month", month)
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Couldn't load this month's strategy" }, { status: 500 });
    source = monthSource(row);
    what = monthWhat(month);
  } else {
    const { data: entries, error } = await supabase
      .from("knowledge_entries")
      .select("kind, title, body")
      .eq("client_id", clientId)
      .eq("section", section)
      .order("created_at");
    if (error) return NextResponse.json({ error: "Couldn't load this client's Knowledge" }, { status: 500 });
    source = sectionSource(entries ?? []);
    what = OVERVIEW_SECTIONS[section as OverviewSection];
  }
  const key = month ? monthSection(month) : section;

  // Nothing in it: no overview.
  if (!source.trim()) {
    await supabase.from("client_strategy_overviews").delete().eq("client_id", clientId).eq("section", key);
    return NextResponse.json({ overview: null });
  }

  const hash = overviewHash(source);
  const { data: existing } = await supabase
    .from("client_strategy_overviews")
    .select("overview, source_hash")
    .eq("client_id", clientId)
    .eq("section", key)
    .maybeSingle();
  if (existing?.source_hash === hash) {
    return NextResponse.json({ overview: existing.overview });
  }

  const result = await runAiTask(supabase, client.agency_id, user.id, overviewPrompt(client.name, what, source));
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  const overview = (result.text ?? "").trim();
  if (!overview) {
    return NextResponse.json({ error: "Frank didn't write an overview" }, { status: 502 });
  }

  const { data: saved, error: saveError } = await supabase
    .from("client_strategy_overviews")
    .upsert({ client_id: clientId, section: key, overview, source_hash: hash, updated_at: new Date().toISOString() }, { onConflict: "client_id,section" })
    .select("id")
    .maybeSingle();
  if (saveError || !saved) {
    return NextResponse.json({ error: "Couldn't save the overview" }, { status: 500 });
  }
  return NextResponse.json({ overview });
}
