import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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

  const { data: profile } = await supabase
    .from("users")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();

  const userInitials = initials(profile?.name, user.email ?? "?");

  return <AppShell userInitials={userInitials}>{children}</AppShell>;
}
