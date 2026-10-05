import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { liveSlides } from "@/lib/instagram/store";

// A live carousel's slides (phase54), for anyone on the agency who can see
// the client: RLS on clients decides, then the server asks Instagram.
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  const mediaId = new URL(request.url).searchParams.get("media") ?? "";
  if (!/^\d{1,40}$/.test(mediaId)) return NextResponse.json({ error: "Invalid post" }, { status: 400 });
  const { data: client } = await supabase.from("clients").select("id").eq("id", id).maybeSingle();
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  return NextResponse.json(await liveSlides(createServiceRoleClient(), id, mediaId));
}
