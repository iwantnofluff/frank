"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// Deletes one creative or copy version through delete_post_version
// (phase30), which refuses one that has comments and anyone who couldn't
// upload a version for this post's client. Neither version table has a
// delete policy of its own.
export function useDeletePostVersion(creativeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ kind, versionId }: { kind: "creative" | "copy"; versionId: string }) => {
      const supabase = createClient();
      const { error } = await supabase.rpc("delete_post_version", { p_kind: kind, p_version_id: versionId });
      if (error) {
        if (error.message.includes("has comments")) throw new Error("This version has comments, so it can't be deleted.");
        if (error.message.includes("not permitted")) throw new Error("You don't have permission to delete this version.");
        throw error;
      }
    },
    // Awaited so the window's tabs have already moved off the deleted
    // version by the time the confirmation closes. The project table and
    // feed show the latest version, so they're refreshed too.
    onSuccess: async (_data, { kind }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [kind === "creative" ? "creative-versions" : "copy-versions", creativeId] }),
        queryClient.invalidateQueries({ queryKey: ["creatives"] }),
        queryClient.invalidateQueries({ queryKey: ["copy-versions-by-creative"] }),
      ]);
    },
  });
}
