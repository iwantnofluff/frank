import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isStaffServer } from "@/lib/is-staff-server";
import { clientOnlyPage } from "@/lib/client-settings-nav";
import { ClientSettingsShell } from "./ClientSettingsShell";

// Client Settings (direct instruction): the same structure as Settings (its
// left menu beside the page you're on) for one client. Staff see every
// page; a client's own people see Knowledge only, and are sent there from
// any other page. RLS still decides what each page can read or change.
//
// Who's asking is read here on the server (speed pass, 2 Nov 2026), so the
// page arrives drawn rather than blank until the browser had asked; the
// page opened is checked here too (x-frank-path, from the proxy), and the
// shell keeps checking as its pages are picked.
export default async function ClientSettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const isStaff = await isStaffServer(await createClient());
  const path = (await headers()).get("x-frank-path") ?? "";
  if (!isStaff && !clientOnlyPage(path)) redirect(`/clients/${id}/settings/knowledge`);
  return (
    <ClientSettingsShell id={id} isStaff={isStaff}>
      {children}
    </ClientSettingsShell>
  );
}
