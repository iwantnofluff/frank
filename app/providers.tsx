"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useButtonSwipe } from "@/components/ui/useButtonSwipe";

export function Providers({ children }: { children: React.ReactNode }) {
  // What's been read stays fresh for 30 seconds: coming back to a screen,
  // or to the tab, inside that shows it at once rather than asking again.
  // Saves refresh what they change straight away (each mutation's
  // invalidation), and open projects and posts update live (useLiveUpdates),
  // so this only spaces out re-reads nobody asked for.
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }));
  useButtonSwipe();

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
