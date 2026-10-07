"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { forgetSignedUrls } from "@/hooks/use-avatar-urls";

// Signed in, but not a member of the agency whose address this is (the
// proxy shows this, with a 403). Each agency's address has its own sign-in,
// so signing out here only ends the session on this address.
export default function NotAMemberPage() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  return (
    <div className="authwrap">
      <div className="authcard">
        <div className="mark authmark">F</div>
        <h1 className="h1">Not part of this workspace</h1>
        <p className="sub">
          {email ? `${email} isn't` : "This account isn't"} a member of the agency at this address. Sign in with the
          account they invited, or ask them to invite you.
        </p>
        <button
          type="button"
          className="btn primary"
          onClick={async () => {
            await createClient().auth.signOut();
    forgetSignedUrls();
            window.location.href = "/login";
          }}
        >
          Sign in with another account
        </button>
      </div>
    </div>
  );
}
