import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { SignOutButton } from "./SignOutButton";

// admin.beingfrank.app (phase37): only for accounts on platform_admins,
// checked here for the pages and again by every /api/admin call.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const {
    data: { user },
  } = await (await createClient()).auth.getUser();
  const { data: isAdmin } = user
    ? await createServiceRoleClient().from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle()
    : { data: null };

  if (!isAdmin) {
    return (
      <div className="authwrap">
        <div className="authcard">
          <div className="mark authmark">F</div>
          <h1 className="h1">Not a platform admin</h1>
          <p className="sub">{user?.email ?? "This account"} can&rsquo;t use Frank Admin.</p>
          <SignOutButton />
        </div>
      </div>
    );
  }

  return (
    <div className="adminwrap">
      <header className="adminbar">
        <Link href="/admin" className="adminbar-t">
          <span className="mark">F</span> Frank Admin
        </Link>
        <span className="grow" />
        <span className="sub">{user!.email}</span>
        <SignOutButton small />
      </header>
      <main className="pad">{children}</main>
    </div>
  );
}
