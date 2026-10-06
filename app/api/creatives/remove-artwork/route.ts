import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Removing a post's artwork now, from its notification's window (phase60):
// the versions keep their rows and comments, the files go. The access check
// and database changes are remove_creative_artwork_now, run as the
// signed-in person (Owners and Admins); it returns only the storage paths
// it freed, removed here with the service role, since no signed-in role
// can delete storage objects. The paths never come from the browser.
export async function POST(request: Request) {
  let creativeId: string | undefined;
  try {
    ({ creativeId } = await request.json());
  } catch {
    return NextResponse.json({ error: "creativeId is required" }, { status: 400 });
  }
  if (!creativeId) return NextResponse.json({ error: "creativeId is required" }, { status: 400 });

  const supabase = await createClient();
  const { data: keys, error } = await supabase.rpc("remove_creative_artwork_now", { p_creative_id: creativeId });
  if (error) {
    const status = error.message.includes("not permitted") ? 403 : error.message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  const paths = (keys ?? []) as string[];
  let filesRemoved = 0;
  if (paths.length) {
    try {
      const { data } = await createServiceRoleClient().storage.from("assets").remove(paths);
      filesRemoved = data?.length ?? 0;
    } catch {
      // The rows are already gone; a file left in storage is the known
      // storage-sweep gap, not a reason to report the removal as failed.
    }
  }
  return NextResponse.json({ ok: true, filesRemoved });
}
