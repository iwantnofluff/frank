"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { signedInUser } from "@/lib/supabase/signed-in-user";
import { useCurrentUser } from "./use-current-user";
import { myProfileQuery, type MyProfile } from "./use-my-profile";

// The last of Frank's updates this person has seen in the bell (phase81),
// kept on them so it's read on every device. Null: none seen yet.
export function useReleasesSeen(enabled: boolean) {
  const { data: user } = useCurrentUser();
  return useQuery({
    ...myProfileQuery(user?.id),
    enabled: enabled && !!user?.id,
    select: (p: MyProfile): { seen: string | null } => ({ seen: p.releases_seen ?? null }),
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
      } = await signedInUser(supabase);
      if (!user) return;
      const { error } = await supabase.from("users").update({ releases_seen: version }).eq("id", user.id);
      if (error) throw error;
    },
    onMutate: (version) =>
      queryClient.setQueriesData<MyProfile>({ queryKey: ["my-profile"] }, (p) => (p ? { ...p, releases_seen: version } : p)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["my-profile"] }),
  });
}
