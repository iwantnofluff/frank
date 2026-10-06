"use client";

import { use, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useIsStaff } from "@/hooks/use-is-staff";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { clientOnlyPage, clientSettingsSections } from "@/lib/client-settings-nav";

// Client Settings (direct instruction): the same structure as Settings (its
// left menu beside the page you're on) for one client. Staff see every
// page; a client's own people see Knowledge only, and are sent there from
// any other page. RLS still decides what each page can read or change.
export default function ClientSettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const pathname = usePathname();
  const router = useRouter();
  const { isStaff, isPending } = useIsStaff();
  const allowed = isStaff || clientOnlyPage(pathname);

  useEffect(() => {
    if (!isPending && !allowed) router.replace(`/clients/${id}/settings/knowledge`);
  }, [isPending, allowed, id, router]);

  if (isPending || !allowed) return null;

  return (
    <div className="setwrap">
      <SettingsNav pathname={pathname} sections={clientSettingsSections(id, isStaff)} label="Client Settings sections" />
      <div className="review-sep" aria-hidden="true" />
      <div className="setmain">{children}</div>
    </div>
  );
}
