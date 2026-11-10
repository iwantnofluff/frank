import type { SupabaseClient } from "@supabase/supabase-js";

export interface SampleRemoval {
  agency_id: string;
  client_id: string;
  creative_ids: string[];
  keys: string[];
}

// After delete_sample_client (phase145) has removed the rows: the files they
// freed, and each sample post's folder under {agency}/sample/, with the
// service role, since no signed-in role can delete storage. A file left
// behind isn't a failed removal; the rows are already gone.
export async function removeSampleFiles(service: SupabaseClient, r: SampleRemoval): Promise<number> {
  const storage = service.storage.from("assets");
  const paths = new Set(r.keys);
  let removed = 0;
  try {
    for (const c of r.creative_ids) {
      const folder = `${r.agency_id}/sample/${c}`;
      const { data: files } = await storage.list(folder, { limit: 1000 });
      for (const f of files ?? []) if (f.id) paths.add(`${folder}/${f.name}`);
    }
    for (let i = 0; i < paths.size; i += 500) {
      const { data: gone } = await storage.remove([...paths].slice(i, i + 500));
      removed += gone?.length ?? 0;
    }
  } catch {
    // The known storage sweep gap, as for delete-permanently.
  }
  return removed;
}
