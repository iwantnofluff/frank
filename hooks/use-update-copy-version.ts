"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { CopyVersionRow } from "./use-copy-versions";

// Saving copy changes into the current version (phase113, direct
// instruction): the latest version, while nobody has commented on it, and
// for the team only. The database decides (update_copy_version) and says
// why when it can't; otherwise the save is a new version
// (useSaveCopyFields).
export function useUpdateCopyVersion(creativeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ fields, latest }: { fields: Record<string, string>; latest: CopyVersionRow }) => {
      const supabase = createClient();
      const { error } = await supabase.rpc("update_copy_version", {
        p_version_id: latest.id,
        p_fields: { ...(latest.fields ?? {}), ...fields },
      });
      if (error) throw error;
      return latest.id;
    },
    // Awaited, as a new version's save is, so the editor and the table's
    // Caption column show the saved words straight away.
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["copy-versions", creativeId] }),
        queryClient.invalidateQueries({ queryKey: ["copy-versions-by-creative"], refetchType: "all" }),
      ]);
    },
  });
}
