"use client";

import { useSyncExternalStore } from "react";

// The visitor's own screen picks the layout (direct instruction): a phone's
// browser gets the phone layout, anything wider the desktop one. The same
// width on the review link and in Frank itself. The server renders the
// desktop layout; a phone switches as the page starts.
export const PHONE_QUERY = "(max-width: 899px)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function usePhoneScreen() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}
