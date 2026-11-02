"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { ADMIN_SECTIONS } from "@/lib/admin/admin-nav";
import { settingsPageFor } from "@/lib/settings-nav";
import { usePhoneScreen } from "@/hooks/use-phone-screen";

// The admin area's left menu: Settings' own collapsing menu, with the
// admin area's sections. On a phone (decided directly, 2 Nov 2026) it
// folds behind a Menu button above the page, which closes once a page is
// chosen, rather than taking most of the screen's width.
export function AdminNav() {
  const pathname = usePathname();
  const phone = usePhoneScreen();
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    setOpen(false);
  }
  if (!phone) return <SettingsNav pathname={pathname} sections={ADMIN_SECTIONS} label="Admin sections" />;
  const current = settingsPageFor(pathname, ADMIN_SECTIONS);
  return (
    <div className="adminnav-phone">
      <div className="adminnav-phone-bar">
        <button type="button" className="btn sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "Close" : "Menu"}
        </button>
        <span>{current ? `${current.section.label} · ${current.page.label}` : ""}</span>
      </div>
      {open && <SettingsNav pathname={pathname} sections={ADMIN_SECTIONS} label="Admin sections" />}
    </div>
  );
}
