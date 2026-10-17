"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { creativeQuery } from "@/hooks/use-creative";
import { creativeVersionsQuery } from "@/hooks/use-creative-versions";
import { copyVersionsQuery } from "@/hooks/use-copy-versions";

// A post warmed while the pointer rests on its table row (reported
// directly: its Edit window, and its page, were slow to open): the post
// and its versions, which the Edit window waits for and the page shows,
// and the page's own route. Only once the pointer has settled, so sweeping
// across the table doesn't load every row; and not again while what's
// loaded is fresh.
const SETTLE_MS = 120;
const FRESH_MS = 30_000;

export function usePrefetchPost() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function start(creativeId: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      router.prefetch(`/creatives/${creativeId}`);
      // A failed warm-up is no matter: opening it fetches it again
      // (prefetchQuery never throws).
      void queryClient.prefetchQuery({ ...creativeQuery(creativeId), staleTime: FRESH_MS });
      void queryClient.prefetchQuery({ ...creativeVersionsQuery(creativeId), staleTime: FRESH_MS });
      void queryClient.prefetchQuery({ ...copyVersionsQuery(creativeId), staleTime: FRESH_MS });
    }, SETTLE_MS);
  }
  function stop() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }
  return { start, stop };
}
