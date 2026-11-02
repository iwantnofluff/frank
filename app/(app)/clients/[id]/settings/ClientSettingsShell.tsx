"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { clientOnlyPage, clientSettingsSections } from "@/lib/client-settings-nav";
import { SettingsMain } from "@/components/settings/SettingsMain";

// Client Settings' frame. Whether this is the team is decided on the server
// (layout.tsx); moving between its pages here keeps a client's own people
// to the pages they may open.
export function ClientSettingsShell({
  id,
  isStaff,
  children,
}: {
  id: string;
  isStaff: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const allowed = isStaff || clientOnlyPage(pathname);

  useEffect(() => {
    if (!allowed) router.replace(`/clients/${id}/settings/knowledge`);
  }, [allowed, id, router]);

  if (!allowed) return null;

  return (
    <div className="setwrap">
      <SettingsNav pathname={pathname} sections={clientSettingsSections(id, isStaff)} label="Client Settings sections" />
      <div className="review-sep" aria-hidden="true" />
      <SettingsMain>{children}</SettingsMain>
    </div>
  );
}
