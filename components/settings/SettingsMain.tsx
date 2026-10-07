"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

// A Settings page's content, sliding in each time a page is picked (direct
// instruction: the Help panel's motion), while the menu beside it stays.
export function SettingsMain({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="setmain">
      {children}
    </div>
  );
}
