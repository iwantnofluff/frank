"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface ClientContactInput {
  name: string;
  email: string;
}

// Full-replace, not a diff against the existing list — the client edit
// modal always submits its whole current set of rows, and this list is
// short and edited occasionally, so delete-then-insert is simpler and no
// less correct than reconciling adds/removes/renames client-side.
export function useSetClientContacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clientId,
      agencyId,
      contacts,
    }: {
      clientId: string;
      agencyId: string;
      contacts: ClientContactInput[];
    }) => {
      const supabase = createClient();

      const { error: deleteError } = await supabase
        .from("client_contacts")
        .delete()
        .eq("client_id", clientId);
      if (deleteError) throw deleteError;

      const rows = contacts
        .filter((c) => c.name.trim() && c.email.trim())
        .map((c) => ({
          agency_id: agencyId,
          client_id: clientId,
          name: c.name.trim(),
          email: c.email.trim(),
        }));
      if (rows.length === 0) return;

      const { error: insertError } = await supabase.from("client_contacts").insert(rows);
      if (insertError) throw insertError;
    },
    onSuccess: (_data, { clientId }) => {
      queryClient.invalidateQueries({ queryKey: ["client-contacts", clientId] });
    },
  });
}
