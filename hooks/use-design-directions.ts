"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { DesignDirection as Body } from "@/lib/ai/design-direction";

export interface DesignDirectionRef {
  n: number;
  // Null for a pasted image (phase111), which has its file's key instead.
  url: string | null;
  title: string | null;
  image: string | null;
  assetKey?: string;
  // A new post's pasted image, by its place, until Create Post saves it.
  pendingIndex?: number;
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

// A new direction from Frank, from the brief as it is in the window,
// streamed (direct instruction: shown as it's written): onProgress hears
// the references Frank is reading, then all the text so far each time
// more arrives.
// On a new post (creativeId null) the window sends its project, name,
// formats and pasted images, and the direction comes back unsaved, for the
// window to keep until Create Post.
export function useRequestDesignDirection(creativeId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      onProgress,
      ...input
    }: {
      concept: string;
      referenceUrls: string[];
      slideCount: number | null;
      newPost?: { projectId: string; name: string; formats: string[]; images: File[] };
      // From the Concept, or a rework of these notes.
      mode: "concept" | "rework" | "followup";
      // The conversation this belongs to; for a follow-up, the new message,
      // the earlier ones with Frank's replies, and the direction as it
      // last stood.
      thread: string;
      ask?: string;
      conversation?: { ask: string; reply: string }[];
      previous?: Body | null;
      notes: { overall: string; slides: string[] };
      // The VO and copy as they are in the window.
      voiceover: string;
      copy: { label: string; text: string }[];
      onProgress?: (progress: { refs: DesignDirectionRef[]; text: string }) => void;
    }): Promise<{ id: string | null; direction?: Body; refs?: DesignDirectionRef[]; skippedFiles: string[] }> => {
      const { newPost, ...brief } = input;
      const images = newPost
        ? await Promise.all(
            newPost.images.map(async (f) => ({
              mediaType: f.type,
              base64: btoa(Array.from(new Uint8Array(await f.arrayBuffer()), (b) => String.fromCharCode(b)).join("")),
            })),
          )
        : undefined;
      const res = await fetch("/api/ai/design-direction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          newPost
            ? { ...brief, projectId: newPost.projectId, name: newPost.name, formats: newPost.formats, images }
            : { creativeId, ...brief },
        ),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Frank didn't answer");
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      let refs: DesignDirectionRef[] = [];
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        let changed = false;
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as {
            type: string;
            refs?: DesignDirectionRef[];
            text?: string;
            id?: string | null;
            direction?: Body;
            skippedFiles?: string[];
            error?: string;
          };
          if (event.type === "refs") refs = event.refs ?? [];
          else if (event.type === "text") text += event.text ?? "";
          else if (event.type === "error") throw new Error(event.error ?? "Frank didn't answer");
          else if (event.type === "done")
            return { id: event.id ?? null, direction: event.direction, refs: event.refs, skippedFiles: event.skippedFiles ?? [] };
          changed = true;
        }
        if (changed) onProgress?.({ refs, text });
      }
      throw new Error("Frank stopped before finishing. Try again.");
    },
    onSuccess: async () => {
      if (creativeId) await queryClient.invalidateQueries({ queryKey: ["design-directions", creativeId] });
    },
  });
}

// A new post's directions, written before it was made, saved with it once
// Create Post makes it: oldest first, each with the one chosen, and a
// pasted image's file once the post's images are saved (by their place).
export async function saveDirectionsForNewPost(
  creativeId: string,
  runs: { body: Body; refs: DesignDirectionRef[]; chosen: number | null }[],
  pastedKeys: string[],
) {
  if (!runs.length) return;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { error } = await supabase.from("design_directions").insert(
    [...runs].reverse().map((r) => ({
      creative_id: creativeId,
      body: r.body,
      chosen: r.chosen,
      created_by: user.id,
      refs: r.refs.map(({ pendingIndex, ...ref }) =>
        pendingIndex !== undefined && pastedKeys[pendingIndex] ? { ...ref, assetKey: pastedKeys[pendingIndex] } : ref,
      ),
    })),
  );
  if (error) throw error;
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
