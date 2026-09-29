"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface ClientContactRow {
  id: string;
  name: string;
  email: string;
}

// The "Client Team" list shown in the client edit modal and picked from on
// the shared-review page (that side reads it via get_shared_review instead
// — this hook is the authenticated, staff-facing read).
export function useClientContacts(clientId: string | undefined) {
  return useQuery({
    queryKey: ["client-contacts", clientId],
    queryFn: async (): Promise<ClientContactRow[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("client_contacts")
        .select("id, name, email")
        .eq("client_id", clientId as string)
        .is("archived_at", null)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });
}
