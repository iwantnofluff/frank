"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { tipById } from "@/lib/tips";

// Lights up a tip's place where it lands (See it in Action): ?tip=<id> on
// the address, or this event where you already are.
export const TIP_SPOT_EVENT = "frank:tip-spot";

const WAIT_MS = 8000;
const GLOW_MS = 2600;

export function TipSpotlight() {
  const asked = useSearchParams().get("tip");
  // Taken as the page opens: the page may take ?new=1 (and this with it)
  // off the address straight away.
  const [taken, setTaken] = useState<string | null>(null);
  const [spot, setSpot] = useState<{ id: string; n: number } | null>(null);
  if (asked && asked !== taken) {
    setTaken(asked);
    setSpot({ id: asked, n: (spot?.n ?? 0) + 1 });
  }

  useEffect(() => {
    function onSpot(e: Event) {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (id) setSpot((s) => ({ id, n: (s?.n ?? 0) + 1 }));
    }
    window.addEventListener(TIP_SPOT_EVENT, onSpot);
    return () => window.removeEventListener(TIP_SPOT_EVENT, onSpot);
  }, []);

  useEffect(() => {
    const tip = spot ? tipById(spot.id) : null;
    if (!tip) return;
    let lit: HTMLElement | null = null;
    let glow: ReturnType<typeof setTimeout> | null = null;
    const started = Date.now();
    // The place can take a moment to appear (a window opening, a table
    // loading): look until it does.
    const look = setInterval(() => {
      const el = tip.spot.map((s) => document.querySelector<HTMLElement>(s)).find(Boolean) ?? null;
      if (!el && Date.now() - started < WAIT_MS) return;
      clearInterval(look);
      if (!el) return;
      lit = el;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.classList.add("tip-spot");
      glow = setTimeout(() => el.classList.remove("tip-spot"), GLOW_MS);
    }, 150);
    // Off the address once it's been taken, so a reload doesn't repeat it.
    const url = new URL(window.location.href);
    if (url.searchParams.has("tip")) {
      url.searchParams.delete("tip");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    return () => {
      clearInterval(look);
      if (glow) clearTimeout(glow);
      lit?.classList.remove("tip-spot");
    };
  }, [spot]);

  return null;
}
