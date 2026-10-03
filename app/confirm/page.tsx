"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Opened from the sign-up email (phase42), on the new agency's own address:
// the one-time token confirms the email and signs the owner in here, then
// it's their dashboard.
function Confirm() {
  const router = useRouter();
  const tokenHash = useSearchParams().get("token_hash");
  const [bad, setBad] = useState(!tokenHash);

  // The token works once: in development React runs effects twice, and the
  // second try would find it used (as on /reset-password).
  const tried = useRef(false);
  useEffect(() => {
    if (!tokenHash || tried.current) return;
    tried.current = true;
    createClient()
      // "email" takes the sign-up token, and a sign-in link made for the
      // same address later (checked on staging): either confirms it.
      .auth.verifyOtp({ token_hash: tokenHash, type: "email" })
      .then(({ error }) => {
        if (error) setBad(true);
        else router.replace("/dashboard");
      });
  }, [tokenHash, router]);

  if (!bad) return <p className="sub">Opening your workspace…</p>;
  return (
    <div className="authcard">
      <div className="mark authmark">F</div>
      <h1 className="h1">This link has expired</h1>
      <p className="sub">
        Confirmation links work once. If you&rsquo;ve already confirmed your email, sign in; if not, sign up again.
      </p>
      <a className="btn primary" href="/login" style={{ textAlign: "center" }}>
        Sign in
      </a>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <div className="authwrap">
      <Suspense fallback={null}>
        <Confirm />
      </Suspense>
    </div>
  );
}
