"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

// A client's Preferences (phase70): how long Approved artwork is kept, what
// happens to undated Approved posts, what its review links show and allow,
// and what a new review link starts with.
export interface ClientPreferences {
  artwork_keep_days: 7 | 14 | 21 | 28;
  undated_artwork: "ask" | "remove";
  feed_shows_other_posts: boolean;
  client_can_approve: boolean;
  link_can_approve: boolean;
  link_expires_days: 0 | 7 | 14 | 30; // 0 = never
  link_passcode: boolean;
  // Days before going live a post should reach the client (phase72).
  lead_days: 14 | 21 | 28 | 35;
  // Posts a month in the client's contract (phase73); null until set.
  contracted_posts_per_month: number | null;
}

// What every client has until a preference is saved (the database's own
// defaults, and Frank's behaviour before phase70).
export const DEFAULT_CLIENT_PREFERENCES: ClientPreferences = {
  artwork_keep_days: 7,
  undated_artwork: "ask",
  feed_shows_other_posts: true,
  client_can_approve: true,
  link_can_approve: true,
  link_expires_days: 14,
  link_passcode: false,
  lead_days: 28,
  contracted_posts_per_month: null,
};

const FIELDS = Object.keys(DEFAULT_CLIENT_PREFERENCES).join(", ");

export function useClientPreferences(clientId: string | null | undefined) {
  return useQuery({
    queryKey: ["client-preferences", clientId],
    queryFn: async (): Promise<ClientPreferences> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("client_preferences")
        .select(FIELDS)
        .eq("client_id", clientId!)
        .maybeSingle();
      if (error) throw error;
      return { ...DEFAULT_CLIENT_PREFERENCES, ...((data as Partial<ClientPreferences> | null) ?? {}) };
    },
    enabled: !!clientId,
  });
}

// Saves what changed, at once (each change saves itself, as People does).
// Only Owners and Admins can (client_preferences RLS); a blocked save comes
// back with no row, which is said rather than taken as saved.
export function useSaveClientPreferences(clientId: string) {
  const queryClient = useQueryClient();
  const key = ["client-preferences", clientId];
  return useMutation({
    mutationFn: async (patch: Partial<ClientPreferences>) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("client_preferences")
        .upsert({ client_id: clientId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "client_id" })
        .select("client_id");
      if (error) throw error;
      if (!data?.length) throw new Error("Only Owners and Admins can change these.");
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: key });
      const before = queryClient.getQueryData<ClientPreferences>(key);
      if (before) queryClient.setQueryData<ClientPreferences>(key, { ...before, ...patch });
      return { before };
    },
    onError: (_e, _patch, ctx) => {
      if (ctx?.before) queryClient.setQueryData(key, ctx.before);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}
