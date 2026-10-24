"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface LatestFeedback {
  body: string;
  createdAt: string;
  // Who said it: the client's person, or a review link's guest.
  name: string;
}

// The calendar table's "Client Feedback" column (docs/parity-gaps.md) —
// the most recent unresolved *public* comment per creative, batched for
// the whole project in one query rather than per row. Public only: an
// internal-only comment isn't "client feedback" by definition, and
// comments_select's own RLS already keeps a client-role caller from
// seeing private ones regardless. The client's only (direct instruction):
// the team's own comments, their Approved Concept included, stay on the
// post's page.
//
// From the team instead (direct instruction: the Internal Feedback column):
// the latest open comment by someone on the team, private or public. The
// team only, so a client's session never asks.
export function useLatestFeedbackByCreative(creativeIds: string[], from: "client" | "team" = "client", enabled = true) {
  const key = [...creativeIds].sort().join(",");
  return useQuery({
    queryKey: ["latest-feedback-by-creative", key, from],
    queryFn: async (): Promise<Record<string, LatestFeedback>> => {
      if (creativeIds.length === 0) return {};
      const supabase = createClient();
      let q = supabase
        .from("comments")
        .select("creative_id, agency_id, author_id, guest_name, body, created_at")
        .in("creative_id", creativeIds);
      if (from === "client") q = q.eq("visibility", "public");
      const { data, error } = await q
        .is("resolved_at", null)
        // Deleted ones (phase97) are marked, not removed: never feedback.
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Which authors are the team, and everyone's names, as useComments
      // works them out: a guest's comment has no author_id.
      const authorIds = [...new Set(data.map((r) => r.author_id).filter((id): id is string => !!id))];
      const team = new Set<string>();
      const names = new Map<string, string>();
      if (authorIds.length > 0) {
        const agencyIds = [...new Set(data.map((r) => r.agency_id as string))];
        const [{ data: users, error: usersError }, { data: members, error: membersError }] = await Promise.all([
          supabase.from("users").select("id, name").in("id", authorIds),
          supabase
            .from("memberships")
            .select("user_id")
            .in("agency_id", agencyIds)
            .is("client_id", null)
            .in("user_id", authorIds),
        ]);
        if (usersError) throw usersError;
        if (membersError) throw membersError;
        for (const u of users) names.set(u.id, u.name);
        for (const m of members) team.add(m.user_id as string);
      }

      const result: Record<string, LatestFeedback> = {};
      for (const row of data) {
        if (result[row.creative_id]) continue;
        const isTeam = !!row.author_id && team.has(row.author_id);
        if (from === "client" ? isTeam : !isTeam) continue;
        result[row.creative_id] = {
          // The client's name is over it, so a client's approval reads as
          // just "Approved Concept" here (direct instruction); the post's
          // page keeps the comment's own words.
          body: row.body === "Client Approved Concept" ? "Approved Concept" : row.body,
          createdAt: row.created_at,
          name: (row.author_id ? names.get(row.author_id) : row.guest_name) ?? "",
        };
      }
      return result;
    },
    enabled: enabled && creativeIds.length > 0,
  });
}
