import { createClient } from "@/lib/supabase/client";
import { validateKnowledgeFile } from "@/lib/knowledge-file-validation";

// Shared by both agency- and client-level knowledge file uploads (the two
// new mutations in use-agency-knowledge-mutations.ts and
// use-knowledge-mutations.ts) — same shape as
// hooks/use-upload-creative-version.ts's upload step, just not tied to a
// creative_id. Path is {agency_id}/knowledge/{uuid}-{filename}; the
// storage.objects RLS (phase8_storage.sql) only inspects the first path
// segment, so this needed no Storage migration of its own.
export async function uploadKnowledgeAsset(agencyId: string, file: File): Promise<string> {
  const validation = validateKnowledgeFile(file);
  if (!validation.ok) throw new Error(validation.message);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${agencyId}/knowledge/${crypto.randomUUID()}-${safeName}`;

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
    // Best-effort — don't leave the file behind with no DB row pointing
    // at it if the insert that was supposed to record it failed.
    await supabase.storage.from("assets").remove([path]);
    throw assetError;
  }

  return asset.id as string;
}
