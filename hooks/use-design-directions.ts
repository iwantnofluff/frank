"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { DesignDirection as Body } from "@/lib/ai/design-direction";

export interface DesignDirectionRef {
  n: number;
  url: string;
  title: string | null;
  image: string | null;
  read: boolean;
}

export interface DesignDirectionRow {
  id: string;
  body: Body;
  refs: DesignDirectionRef[];
  chosen: number | null;
  created_at: string;
  author: string | null;
}

// A post's design directions from Frank (phase110), newest first. Staff
// only (RLS): a Client gets none.
export function useDesignDirections(creativeId: string | null | undefined) {
  return useQuery({
    queryKey: ["design-directions", creativeId],
    queryFn: async (): Promise<DesignDirectionRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("design_directions")
        .select("id, body, refs, chosen, created_at, created_by")
        .eq("creative_id", creativeId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!data.length) return [];
      // Two plain queries, not an embed (hooks/use-comments.ts's reasoning).
      const { data: authors } = await supabase
        .from("users")
        .select("id, name")
        .in("id", data.map((d) => d.created_by).filter(Boolean));
      return data.map((d) => ({
        id: d.id,
        body: d.body as Body,
        refs: (d.refs ?? []) as DesignDirectionRef[],
        chosen: d.chosen,
        created_at: d.created_at,
        author: (authors ?? []).find((a) => a.id === d.created_by)?.name ?? null,
      }));
    },
    enabled: !!creativeId,
  });
}

// A new direction from Frank, from the brief as it is in the window.
export function useRequestDesignDirection(creativeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      concept: string;
      referenceUrls: string[];
      slideCount: number | null;
    }): Promise<{ id: string; skippedFiles: string[] }> => {
      const res = await fetch("/api/ai/design-direction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creativeId, ...input }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Frank didn't answer");
      return { id: data.id, skippedFiles: data.skippedFiles ?? [] };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["design-directions", creativeId] });
    },
  });
}

// Which direction the team chose (Use This), or none. A blocked update
// returns no row rather than an error, so it's checked.
export function useChooseDesignDirection(creativeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, chosen }: { id: string; chosen: number | null }) => {
      const supabase = createClient();
      const { data, error } = await supabase.from("design_directions").update({ chosen }).eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("You don't have permission to change this direction.");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["design-directions", creativeId] });
    },
  });
}
