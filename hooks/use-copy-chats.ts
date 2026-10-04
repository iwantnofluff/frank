"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { CopyChatMode, CopyDraft } from "@/lib/ai/copy-chat";

export interface CopyChatMessage {
  id: string;
  role: "user" | "assistant";
  body: string;
  drafts: CopyDraft[];
  created_at: string;
}

export interface CopyChat {
  id: string;
  mode: CopyChatMode;
  created_at: string;
  updated_at: string;
  author: string | null;
  messages: CopyChatMessage[];
}

// A post's conversations with Claude about its copy (phase52), newest
// first. Staff only (RLS).
export function useCopyChats(creativeId: string) {
  return useQuery({
    queryKey: ["copy-chats", creativeId],
    queryFn: async (): Promise<CopyChat[]> => {
      const supabase = createClient();
      const { data: chats, error } = await supabase
        .from("copy_chats")
        .select("id, mode, created_at, updated_at, created_by")
        .eq("creative_id", creativeId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      if (!chats.length) return [];
      // Two plain queries, not an embed (hooks/use-comments.ts's reasoning).
      const [{ data: messages, error: mError }, { data: authors }] = await Promise.all([
        supabase
          .from("copy_chat_messages")
          .select("id, chat_id, role, body, drafts, created_at")
          .in("chat_id", chats.map((c) => c.id))
          .order("created_at"),
        supabase.from("users").select("id, name").in("id", chats.map((c) => c.created_by).filter(Boolean)),
      ]);
      if (mError) throw mError;
      return chats.map((c) => ({
        id: c.id,
        mode: c.mode as CopyChatMode,
        created_at: c.created_at,
        updated_at: c.updated_at,
        author: (authors ?? []).find((a) => a.id === c.created_by)?.name ?? null,
        messages: (messages ?? []).filter((m) => m.chat_id === c.id) as unknown as CopyChatMessage[],
      }));
    },
    enabled: !!creativeId,
  });
}

// One message: starts a conversation (mode) or continues one (chatId).
export function useSendCopyChat(creativeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      chatId?: string;
      mode?: CopyChatMode;
      message?: string;
      currentFields: Record<string, string>;
    }): Promise<{ chatId: string; skippedFiles: string[] }> => {
      const res = await fetch("/api/ai/copy-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creativeId, ...input }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Claude didn't answer");
      return { chatId: data.chatId, skippedFiles: data.skippedFiles ?? [] };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["copy-chats", creativeId] });
    },
  });
}
