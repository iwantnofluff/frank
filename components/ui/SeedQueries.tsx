"use client";

import { useEffect, useState, type ReactNode } from "react";
import { HydrationBoundary, hydrate, useQueryClient, type DehydratedState } from "@tanstack/react-query";

// Becomes true once the app has drawn in the browser for the first time.
let committed = false;

// TanStack's HydrationBoundary, plus one thing: on the first draw (the
// server's, and the browser's first pass over it) it fills in queries a
// component higher up has already started but has no data for yet, such
// as the rail asking for the post the page then reads. HydrationBoundary
// leaves those until after the page has loaded, which drew the page as
// still loading (direct instruction: the post's artwork showed late).
// Safe then because nothing is subscribed yet; later, on moving between
// pages, it's HydrationBoundary's own way as before.
export function SeedQueries({ state, children }: { state: DehydratedState; children: ReactNode }) {
  const client = useQueryClient();
  useState(() => {
    if (!committed) hydrate(client, state);
    return null;
  });
  useEffect(() => {
    committed = true;
  }, []);
  return <HydrationBoundary state={state}>{children}</HydrationBoundary>;
}
