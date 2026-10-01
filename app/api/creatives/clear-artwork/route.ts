import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// Deletes every artwork version of a post — its versions, slides, the
// comments on them, and the files (phase33). The access check and the
// database deletes are delete_creative_artwork, run as the signed-in
// person; it returns only the storage paths it freed, which are then removed
// with the service role, since no signed-in role can delete storage
// objects. The paths never come from the browser.
export async function POST(request: Request) {
  let creativeId: string | undefined;
  try {
    ({ creativeId } = await request.json());
  } catch {
    return NextResponse.json({ error: "creativeId is required" }, { status: 400 });
  }
  if (!creativeId) return NextResponse.json({ error: "creativeId is required" }, { status: 400 });

  const supabase = await createClient();
  const { data: keys, error } = await supabase.rpc("delete_creative_artwork", { p_creative_id: creativeId });
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
      // storage-sweep gap, not a reason to report the delete as failed.
    }
  }
  return NextResponse.json({ ok: true, filesRemoved });
}
