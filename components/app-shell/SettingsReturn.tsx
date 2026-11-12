"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { rememberPage } from "@/lib/settings-return";

// Notes each page opened outside Settings, for Settings' X to go back to.
export function SettingsReturn() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    rememberPage(search ? `${pathname}?${search}` : pathname);
  }, [pathname, search]);
  return null;
}
