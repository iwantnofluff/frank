"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useButtonSwipe } from "@/components/ui/useButtonSwipe";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  useButtonSwipe();

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
