"use client";

import { useQuery } from "@tanstack/react-query";
import type { LinkPreview } from "@/lib/link-preview";

// A reference link's preview (app/api/link-preview), fetched when its hover
// card first opens and kept for the session. Null when the page offers
// nothing to show.
export function useLinkPreview(url: string | null) {
  return useQuery({
    queryKey: ["link-preview", url],
    queryFn: async (): Promise<LinkPreview | null> => {
      const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url!)}`);
      if (!res.ok) return null;
      const data = (await res.json()) as { preview: LinkPreview | null };
      return data.preview;
    },
    enabled: !!url,
    staleTime: Infinity,
    retry: false,
  });
}
