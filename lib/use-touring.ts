"use client";

import { useSyncExternalStore } from "react";
import { isTouring, subscribeTouring } from "./tour";

// Whether Frank Tour or a Show Me is running, for what should wait or step
// aside meanwhile (tips, Ask Frank's panel). Its own file so lib/tour.ts,
// plain data, can be read on the server too (Ask Frank's route).
export function useTouring() {
  return useSyncExternalStore(subscribeTouring, isTouring, () => false);
}
