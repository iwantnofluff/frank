import { createClient } from "@/lib/supabase/client";

// Same shape as uploadClientLogo, pointing agency_settings.logo_asset_id at
// the new file instead. Path is {agency_id}/agency-logo/... — the bucket
// policies only look at the agency segment; assets_select lets client-side
// members read it too (phase28).
export async function setAgencyLogo(agencyId: string, file: File | null) {
  const supabase = createClient();
  let assetId: string | null = null;

  if (file) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in");
    const ext = file.type === "image/png" ? "png" : "jpg";
    const path = `${agencyId}/agency-logo/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("assets")
      .upload(path, file, { contentType: file.type });
    if (uploadError) throw uploadError;
    const { data: asset, error: assetError } = await supabase
      .from("assets")
      .insert({
        agency_id: agencyId,
        storage_key: path,
        filename: file.name,
        mime_type: file.type,
        bytes: file.size,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (assetError) {
      await supabase.storage.from("assets").remove([path]);
      throw assetError;
    }
    assetId = asset.id as string;
  }

  const { data, error } = await supabase
    .from("agency_settings")
    .upsert({ agency_id: agencyId, logo_asset_id: assetId }, { onConflict: "agency_id" })
    .select("agency_id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Only Admins and Owners can change the agency logo.");
}
