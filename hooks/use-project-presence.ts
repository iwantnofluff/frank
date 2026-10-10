"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useMyProfile } from "@/hooks/use-my-profile";

// Who else on the team has this project open right now (direct instruction,
// phase82): its table, or one of its posts, and whether they have that
// post's Edit window open. Supabase Realtime's presence, one room per
// project: each person says where they are; nothing is stored. The team
// only (decided directly): a client's people neither join nor see it.
export interface PresentPerson {
  userId: string;
  name: string;
  avatarAssetId: string | null;
  // The post they're on (null: the project's table), and editing it.
  viewing: string | null;
  editing: boolean;
}

export function useProjectPresence(
  projectId: string | null | undefined,
  where: { viewing: string | null; editing: boolean },
  enabled: boolean,
): PresentPerson[] {
  const { data: me } = useMyProfile();
  const [others, setOthers] = useState<PresentPerson[]>([]);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const meId = me?.id;
  const on = enabled && !!projectId && !!meId;

  useEffect(() => {
    if (!on) return;
    const supabase = createClient();
    const channel = supabase.channel(`presence:project:${projectId}`, { config: { presence: { key: meId } } });
    channelRef.current = channel;
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<PresentPerson>();
      // One entry per person (several tabs: editing in any counts).
      const byPerson = new Map<string, PresentPerson>();
      for (const [key, metas] of Object.entries(state)) {
        if (key === meId) continue;
        for (const m of metas) {
          const was = byPerson.get(key);
          byPerson.set(key, was ? { ...was, editing: was.editing || m.editing, viewing: m.editing ? m.viewing : (was.viewing ?? m.viewing) } : m);
        }
      }
      setOthers([...byPerson.values()].sort((a, b) => a.name.localeCompare(b.name)));
    });
    let cancelled = false;
    // Joined with the signed-in session, as the live comments are.
    void supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      if (!cancelled) channel.subscribe();
    });
    return () => {
      cancelled = true;
      channelRef.current = null;
      void supabase.removeChannel(channel);
      setOthers([]);
    };
  }, [on, projectId, meId]);

  // Where I am, said again whenever it changes.
  const name = me?.name;
  const avatar = me?.avatar_asset_id ?? null;
  useEffect(() => {
    if (!on) return;
    const payload: PresentPerson = { userId: meId!, name: name || "Someone", avatarAssetId: avatar, viewing: where.viewing, editing: where.editing };
    let tries = 0;
    // Tracking waits for the room to be joined.
    const timer = setInterval(() => {
      const ch = channelRef.current;
      if (ch && (ch as unknown as { state: string }).state === "joined") {
        void ch.track(payload);
        clearInterval(timer);
      } else if (++tries > 50) clearInterval(timer);
    }, 200);
    return () => clearInterval(timer);
  }, [on, meId, name, avatar, where.viewing, where.editing]);

  return others;
}
