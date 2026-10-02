"use client";

import { createClient } from "@/lib/supabase/client";

export function SignOutButton({ small = false }: { small?: boolean }) {
  return (
    <button
      type="button"
      className={small ? "btn sm" : "btn primary"}
      onClick={async () => {
        await createClient().auth.signOut();
        window.location.href = "/login";
      }}
    >
      Sign out
    </button>
  );
}
