"use client";

import { usePathname } from "next/navigation";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { ADMIN_SECTIONS } from "@/lib/admin/admin-nav";

// The admin area's left menu: Settings' own collapsing menu, with the
// admin area's sections.
export function AdminNav() {
  return <SettingsNav pathname={usePathname()} sections={ADMIN_SECTIONS} label="Admin sections" />;
}
