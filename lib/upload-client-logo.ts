import { createClient } from "@/lib/supabase/client";

// Same shape as uploadAvatar: file, then its assets row, then point the
// client at it. Path is {agency_id}/client-logos/{client_id}/... — the
// bucket policies only look at the agency segment.
export async function uploadClientLogo(agencyId: string, clientId: string, file: File) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const ext = file.type === "image/png" ? "png" : "jpg";
  const path = `${agencyId}/client-logos/${clientId}/${crypto.randomUUID()}.${ext}`;
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

  const { data: updated, error: clientError } = await supabase
    .from("clients")
    .update({ logo_asset_id: asset.id })
    .eq("id", clientId)
    .select("id");
  if (clientError) throw clientError;
  if (!updated?.length) throw new Error("Couldn't save the image to this client");
}

export async function removeClientLogo(clientId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("clients")
    .update({ logo_asset_id: null })
    .eq("id", clientId)
    .select("id");
  if (error) throw error;
  if (!data?.length) throw new Error("Couldn't remove this client's image");
}
