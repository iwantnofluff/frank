"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { FeedResult } from "@/lib/instagram/store";

// Clients' Instagram connections (phase54). The connection rows are read
// straight (RLS: staff who can see the client); the live feed and anything
// needing the token go through the server.
export interface InstagramConnection {
  id: string;
  client_id: string;
  username: string;
  name: string | null;
  profile_picture_url: string | null;
  followers_count: number | null;
  media_count: number | null;
  connected_by_name: string | null;
  connected_at: string;
  needs_reconnect_at: string | null;
}

export function useInstagramConnections() {
  return useQuery({
    queryKey: ["instagram-connections"],
    queryFn: async (): Promise<InstagramConnection[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("instagram_connections")
        .select(
          "id, client_id, username, name, profile_picture_url, followers_count, media_count, connected_by_name, connected_at, needs_reconnect_at",
        );
      if (error) throw error;
      return data;
    },
  });
}

// Whether Frank's Meta app is set up on this environment yet.
export function useInstagramConfigured() {
  return useQuery({
    queryKey: ["instagram-configured"],
    queryFn: async () => {
      const res = await fetch("/api/connections/instagram/status");
      return ((await res.json()) as { configured: boolean }).configured;
    },
    staleTime: Infinity,
  });
}

// A client's live feed, a page at a time as the grid scrolls (Instagram's
// own cursor), to the account's first post.
export function useClientInstagramFeed(clientId: string | null | undefined) {
  return useInfiniteQuery({
    queryKey: ["instagram-feed", clientId],
    queryFn: async ({ pageParam }): Promise<FeedResult> => {
      const q = pageParam ? `?after=${encodeURIComponent(pageParam)}` : "";
      const res = await fetch(`/api/clients/${clientId}/instagram${q}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't load the live feed");
      return data as FeedResult;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.status === "ok" ? last.feed.next : null),
    enabled: !!clientId,
    staleTime: 5 * 60_000,
  });
}

// The address that sends someone to Instagram's sign-in for this client,
// coming back to the page they started on.
export const connectUrl = (clientId: string, returnPath: string) =>
  `/api/connections/instagram/start?clientId=${encodeURIComponent(clientId)}&return=${encodeURIComponent(returnPath)}`;

export function useDisconnectInstagram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (connectionId: string) => {
      const supabase = createClient();
      const { data, error } = await supabase.from("instagram_connections").delete().eq("id", connectionId).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Only Owners and Admins can disconnect an account.");
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["instagram-connections"] }),
        queryClient.invalidateQueries({ queryKey: ["instagram-feed"] }),
      ]);
    },
  });
}

export function useCreateConnectLink() {
  return useMutation({
    mutationFn: async (clientId: string): Promise<string> => {
      const res = await fetch(`/api/clients/${clientId}/instagram/link`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't make the link");
      return data.url as string;
    },
  });
}

// A client's connect link, opened without an account.
export function useConnectLink(token: string) {
  return useQuery({
    queryKey: ["instagram-connect-link", token],
    queryFn: async (): Promise<{
      status: "ok" | "used" | "expired" | "not_found";
      clientName: string | null;
      agencyName: string | null;
    }> => (await fetch(`/api/connections/instagram/link-info?token=${encodeURIComponent(token)}`)).json(),
  });
}

// A live carousel's slides, fetched when it's opened.
export function useClientInstagramSlides(clientId: string | null | undefined, mediaId: string | null) {
  return useQuery({
    queryKey: ["instagram-slides", clientId, mediaId],
    queryFn: async (): Promise<import("@/lib/instagram/store").LiveSlide[]> => {
      const res = await fetch(`/api/clients/${clientId}/instagram/slides?media=${encodeURIComponent(mediaId!)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.status !== "ok") throw new Error(data.error ?? data.message ?? "Couldn't load this carousel");
      return data.slides;
    },
    enabled: !!clientId && !!mediaId,
    staleTime: 5 * 60_000,
  });
}
