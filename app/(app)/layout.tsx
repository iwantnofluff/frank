import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { AppShell } from "@/components/app-shell/AppShell";
import { initials } from "@/lib/initials";

// The middleware already redirects unauthenticated requests to /login; this
// check is a second, independent layer rather than the only one — the same
// "don't trust a single gate" principle the schema's RLS policies apply to
// data access.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // A deactivated or removed person still holds a valid session; RLS already
  // shows them nothing, but they'd see an empty app with no explanation.
  const { data: active } = await supabase
    .from("memberships")
    .select("id")
    .eq("user_id", user.id)
    .is("removed_at", null)
    .not("accepted_at", "is", null)
    .limit(1);
  if (!active?.length) {
    // RLS hides every row of an agency the caller is no longer in, so the
    // name comes from the service-role client — read only, only their own row.
    const { data: last } = await createServiceRoleClient()
      .from("memberships")
      .select("agencies(name)")
      .eq("user_id", user.id)
      .not("removed_at", "is", null)
      .order("removed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const name = (last?.agencies as unknown as { name: string } | null)?.name;
    redirect(name ? `/access-removed?agency=${encodeURIComponent(name)}` : "/access-removed");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();

  const userInitials = initials(profile?.name, user.email ?? "?");

  return (
    <AppShell
      userInitials={userInitials}
      userName={profile?.name ?? null}
      userEmail={user.email ?? ""}
    >
      {children}
    </AppShell>
  );
}
