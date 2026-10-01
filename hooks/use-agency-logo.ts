"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { setAgencyLogo } from "@/lib/upload-agency-logo";

// file: a cropped square to set, or null to remove the logo.
export function useSetAgencyLogo(agencyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File | null) => setAgencyLogo(agencyId, file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["agency-settings", agencyId] });
    },
  });
}
