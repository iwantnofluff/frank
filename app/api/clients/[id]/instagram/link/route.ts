import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// A one-time link for the client to connect their own Instagram (phase54),
// so they never share their password. An Owner or Admin makes it, through
// their own session (instagram_connect_links_insert decides). 7 days.
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await ctx.params;
  const token = randomBytes(24).toString("base64url");
  const { error } = await supabase.from("instagram_connect_links").insert({
    client_id: id,
    token_hash: createHash("sha256").update(token).digest("hex"),
    created_by: user.id,
    expires_at: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
  });
  if (error) return NextResponse.json({ error: "Only Owners and Admins can send a connect link" }, { status: 403 });
  return NextResponse.json({ url: `${new URL(request.url).origin}/connect/instagram/${token}` });
}
