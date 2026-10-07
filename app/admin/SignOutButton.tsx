"use client";

import { createClient } from "@/lib/supabase/client";
import { forgetSignedUrls } from "@/hooks/use-avatar-urls";

export function SignOutButton({ small = false }: { small?: boolean }) {
  return (
    <button
      type="button"
      className={small ? "btn sm" : "btn primary"}
      onClick={async () => {
        await createClient().auth.signOut();
    forgetSignedUrls();
        window.location.href = "/login";
      }}
    >
      Sign out
    </button>
  );
}
