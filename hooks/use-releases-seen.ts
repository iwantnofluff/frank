"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// The last of Frank's updates this person has seen in the bell (phase81),
// kept on them so it's read on every device. Null: none seen yet.
export function useReleasesSeen(enabled: boolean) {
  return useQuery({
    queryKey: ["releases-seen"],
    enabled,
    queryFn: async (): Promise<{ seen: string | null }> => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return { seen: null };
      const { data, error } = await supabase.from("users").select("releases_seen").eq("id", user.id).single();
      if (error) throw error;
      return { seen: (data.releases_seen as string | null) ?? null };
    },
  });
}

// Read up to this version.
export function useMarkReleasesSeen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (version: string) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from("users").update({ releases_seen: version }).eq("id", user.id);
      if (error) throw error;
    },
    onMutate: (version) => queryClient.setQueryData(["releases-seen"], { seen: version }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["releases-seen"] }),
  });
}
