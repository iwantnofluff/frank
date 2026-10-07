"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// Each new screen comes in with the Help panel's motion (direct
// instruction): a fade and a short slide from the right. Within Settings,
// or a client's Settings, the screen itself stays (its menu shouldn't
// slide every time a page is picked); their own content animates instead.
function screenKey(pathname: string) {
  if (pathname.startsWith("/settings")) return "/settings";
  const clientSettings = pathname.match(/^\/clients\/[^/]+\/settings/);
  return clientSettings ? clientSettings[0] : pathname;
}

export function ViewTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={screenKey(pathname)} className="view on screen-in">
      {children}
    </div>
  );
}
