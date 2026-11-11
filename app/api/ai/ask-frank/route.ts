import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { runAiTask } from "@/lib/ai/run-ai-task";
import { ASK_FRANK_MODEL, askFrankBase, askFrankQuestion, type Asker, type AskTurn } from "@/lib/ai/ask-frank";

// Ask Frank (phase147, direct instruction): anyone signed in to the
// workspace, its team or a client's people, asks about Frank and the answer
// streams back, one JSON line per event as Design with Frank's does. Logged
// as 'ask_frank', not counted towards the workspace's AI limit. As a guard
// on a free feature, one person can ask up to ASK_LIMIT a day.
const ASK_LIMIT = 100;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    agencyId?: string;
    question?: string;
    history?: AskTurn[];
    path?: string;
  };
  const question = body.question?.trim().slice(0, 1000) ?? "";
  if (!body.agencyId || !question) return NextResponse.json({ error: "Ask a question first" }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { data: membership } = await supabase
    .from("memberships")
    .select("role, client_id")
    .eq("agency_id", body.agencyId)
    .eq("user_id", user.id)
    .is("removed_at", null)
    .not("accepted_at", "is", null)
    .order("client_id", { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "Only people in this workspace can ask Frank" }, { status: 403 });
  const asker: Asker = membership.client_id
    ? "client"
    : membership.role === "owner" || membership.role === "primary_owner"
      ? "owner"
      : membership.role === "admin"
        ? "admin"
        : "user";

  // The service role writes the usage (a client's people can't), and reads
  // today's count.
  const admin = createServiceRoleClient();
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await admin
    .from("ai_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("task", "ask_frank")
    .gte("created_at", dayStart.toISOString());
  if ((count ?? 0) >= ASK_LIMIT) {
    return NextResponse.json({ error: "You've asked Frank a lot today. Try again tomorrow, or browse the topics above." }, { status: 429 });
  }

  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((t) => (t?.role === "user" || t?.role === "frank") && typeof t.text === "string")
    .slice(-6);
  const prompt = [askFrankBase(), askFrankQuestion(asker, body.path ?? "/", history, question)];

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const result = await runAiTask(admin, body.agencyId!, user.id, "ask_frank", prompt, [], (text) => send({ type: "text", text }), ASK_FRANK_MODEL);
        if (!result.ok || !result.text) send({ type: "error", error: result.error ?? "Frank didn't answer" });
        else send({ type: "done", text: result.text });
      } catch (e) {
        send({ type: "error", error: e instanceof Error ? e.message : "Frank didn't answer" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
