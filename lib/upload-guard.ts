import { createClient } from "@/lib/supabase/client";
import { isReadOnly, storageProblem } from "@/lib/plans";

// Asked before every upload (phase41), so a refusal says why. The database
// enforces both rules regardless (enforce_storage_limits on
// storage.objects), but Storage reports its refusal only as "database
// error", after the file has been sent.
export async function assertCanUpload(agencyId: string, bytes: number) {
  const supabase = createClient();
  const [{ data: agency }, { data: used }] = await Promise.all([
    supabase.from("agencies").select("plan, trial_ends_at, storage_limit_bytes").eq("id", agencyId).maybeSingle(),
    supabase.rpc("agency_storage_used", { check_agency_id: agencyId }),
  ]);
  // Not readable (a guest, say): leave it to the database.
  if (!agency) return;
  if (isReadOnly(agency.plan, agency.trial_ends_at)) {
    throw new Error("Your workspace's free trial has ended, so Frank is read-only. Choose a plan in Settings → Your Plan to carry on.");
  }
  const problem = typeof used === "number" ? storageProblem(used, agency.storage_limit_bytes as number | null, bytes) : null;
  if (problem) throw new Error(problem);
}
