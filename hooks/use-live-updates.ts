"use client";

import { useEffect } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface LiveSource {
  table: string;
  // A Realtime filter, e.g. "creative_id=eq.<id>" or "chat_id=in.(a,b)".
  filter?: string;
}

// Reloads some queries the moment one of these tables changes, from any
// device (direct instruction: a comment made on a phone shows on the
// desktop without a refresh). Supabase Realtime only delivers a change to
// someone whose select policy lets them see the row (phase65), and it's
// only a nudge: the reload goes through the usual rules, so nothing is
// shown that couldn't be read already.
export function useLiveUpdates(name: string, sources: LiveSource[], queryKeys: QueryKey[], enabled = true) {
  const queryClient = useQueryClient();
  // By value, so a new array each render doesn't resubscribe.
  const signature = JSON.stringify(sources);
  const keySignature = JSON.stringify(queryKeys);

  useEffect(() => {
    if (!enabled) return;
    const keys = JSON.parse(keySignature) as QueryKey[];
    const supabase = createClient();
    let channel = supabase.channel(`live:${name}`);
    for (const s of JSON.parse(signature) as LiveSource[]) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: s.table, ...(s.filter ? { filter: s.filter } : {}) },
        () => {
          for (const key of keys) void queryClient.invalidateQueries({ queryKey: key });
        },
      );
    }
    // The live connection doesn't take the page's signed-in session on its
    // own; without it, it listens as an anonymous visitor and the database
    // (rightly) sends it nothing. Checked: with the session it hears a
    // change at once.
    let cancelled = false;
    void supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return;
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      if (!cancelled) channel.subscribe();
    });
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [name, signature, keySignature, enabled, queryClient]);
}
