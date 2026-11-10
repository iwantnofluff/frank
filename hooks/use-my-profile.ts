"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useCurrentUser } from "./use-current-user";
import { uploadAvatar } from "@/lib/upload-avatar";

export interface MyProfile {
  id: string;
  email: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  designation: string | null;
  bio: string | null;
  avatar_asset_id: string | null;
  // Read here for useReleasesSeen and useMyTips too: one read of the
  // person's own row per page, not three.
  releases_seen: string | null;
  tips_every_hours: number | null;
  tips_seen: string[] | null;
  tips_last_at: string | null;
  // When Frank Tour was shown to them (phase144); null, not yet.
  tour_seen_at: string | null;
}

const PROFILE_COLUMNS =
  "id, email, name, first_name, last_name, designation, bio, avatar_asset_id, releases_seen, tips_every_hours, tips_seen, tips_last_at, tour_seen_at";

export function myProfileQuery(userId: string | undefined) {
  return {
    queryKey: ["my-profile", userId],
    queryFn: async (): Promise<MyProfile> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("users")
        .select(PROFILE_COLUMNS)
        .eq("id", userId!)
        .single();
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60_000,
  };
}

export function useMyProfile() {
  const { data: user } = useCurrentUser();
  return useQuery({ ...myProfileQuery(user?.id), enabled: !!user?.id });
}

// Names and designation come back title-cased by the database trigger
// (users_normalise_profile), whatever was sent.
async function invalidateProfileViews(queryClient: ReturnType<typeof useQueryClient>) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["my-profile"] }),
    queryClient.invalidateQueries({ queryKey: ["team-members"] }),
    queryClient.invalidateQueries({ queryKey: ["comments"] }),
  ]);
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  return useMutation({
    mutationFn: async (input: {
      first_name: string;
      last_name: string;
      designation: string;
      bio: string;
    }) => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("users")
        .update(input)
        .eq("id", user!.id)
        .select(PROFILE_COLUMNS);
      if (error) throw error;
      if (!data?.length) throw new Error("Couldn't save your profile");
      return data[0] as MyProfile;
    },
    onSuccess: () => invalidateProfileViews(queryClient),
  });
}

export function useChangeAvatar(agencyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadAvatar(agencyId!, file),
    onSuccess: () => invalidateProfileViews(queryClient),
  });
}

export function useRemoveAvatar() {
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  return useMutation({
    mutationFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("users")
        .update({ avatar_asset_id: null })
        .eq("id", user!.id)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Couldn't remove your photo");
    },
    onSuccess: () => invalidateProfileViews(queryClient),
  });
}

// The signed-in person's first name, for addressing them ("Raj, …"):
// first_name, else the first word of their name, else null.
export function useMyFirstName(): string | null {
  const { data: profile } = useMyProfile();
  const first = profile?.first_name?.trim() || profile?.name?.trim().split(/\s+/)[0] || null;
  // An un-set-up account's name can be its email address — never "raj@…,".
  return first && !first.includes("@") ? first : null;
}
