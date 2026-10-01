"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { removeClientLogo, uploadClientLogo } from "@/lib/upload-client-logo";

// file: a prepared square image to set, or null to remove the current one.
export function useSaveClientLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      agencyId,
      clientId,
      file,
    }: {
      agencyId: string;
      clientId: string;
      file: File | null;
    }) => {
      if (file) await uploadClientLogo(agencyId, clientId, file);
      else await removeClientLogo(clientId);
    },
    onSuccess: async (_data, { clientId }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["clients"] }),
        queryClient.invalidateQueries({ queryKey: ["client", clientId] }),
      ]);
    },
  });
}
