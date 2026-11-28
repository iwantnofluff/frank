"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface PostHit {
  id: string;
  name: string;
  project_id: string;
}

// The header search's posts (direct instruction): by name, as typed, a
// moment after typing stops. Asked of the database rather than loaded up
// front, as a workspace's posts run to thousands; RLS keeps it to the posts
// the person can see (a client's, never Ideas), archived ones left out.
export function useSearchPosts(query: string, limit: number) {
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);
  return useQuery({
    queryKey: ["search-posts", term.toLowerCase(), limit],
    enabled: term.length >= 2,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<PostHit[]> => {
      // % and _ are ilike's wildcards; typed, they mean themselves.
      const pattern = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const { data, error } = await createClient()
        .from("creatives")
        .select("id, name, project_id")
        .ilike("name", pattern)
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as PostHit[];
    },
  });
}
