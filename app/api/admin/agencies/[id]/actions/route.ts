import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/admin/require-platform-admin";

// What the admin area has done in this agency (phase51), newest first.
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const { data, error } = await auth.admin
    .from("admin_actions")
    .select("id, actor_name, action, target, detail, reason, created_at")
    .eq("agency_id", id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ actions: data });
}
