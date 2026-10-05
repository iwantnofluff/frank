import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { liveFeed } from "@/lib/instagram/store";

// A client's live Instagram feed (phase54), for anyone on the agency who
// can see the client: RLS on clients decides, then the server reads the
// token and Instagram with the service role.
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  const { data: client } = await supabase.from("clients").select("id").eq("id", id).maybeSingle();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  // A later page (Instagram's own cursor), as the grid scrolls.
  const after = new URL(request.url).searchParams.get("after");
  if (after && !/^[\w=-]{1,400}$/.test(after)) return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  return NextResponse.json(await liveFeed(createServiceRoleClient(), id, after));
}
