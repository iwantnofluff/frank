"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MIN_PASSWORD_LENGTH } from "@/lib/invites/constants";

// Opened from the reset email: the one-time token signs the person in for
// this address, then they choose a new password.
function ResetPassword() {
  const tokenHash = useSearchParams().get("token_hash");
  const [state, setState] = useState<"checking" | "ready" | "bad" | "done">(tokenHash ? "checking" : "bad");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The token works once: in development React runs effects twice, and the
  // second try would find it used and call the link expired.
  const tried = useRef(false);
  useEffect(() => {
    if (!tokenHash || tried.current) return;
    tried.current = true;
    createClient()
      .auth.verifyOtp({ token_hash: tokenHash, type: "recovery" })
      .then(({ error }) => setState(error ? "bad" : "ready"));
  }, [tokenHash]);

  if (state === "checking") return <p className="sub">Checking the link…</p>;
  if (state === "bad") {
    return (
      <div className="authcard">
        <div className="mark authmark">F</div>
        <h1 className="h1">This link has expired</h1>
        <p className="sub">Reset links work once, for an hour. Ask for a new one.</p>
        <a className="btn primary" href="/forgot-password" style={{ textAlign: "center" }}>
          Send a new link
        </a>
      </div>
    );
  }
  if (state === "done") {
    return (
      <div className="authcard">
        <div className="mark authmark">F</div>
        <h1 className="h1">Password changed</h1>
        <p className="sub">You&rsquo;re signed in with your new password.</p>
        <a className="btn primary" href="/dashboard" style={{ textAlign: "center" }}>
          Continue
        </a>
      </div>
    );
  }
  return (
    <form
      className="authcard"
      onSubmit={async (e) => {
        e.preventDefault();
        if (password.length < MIN_PASSWORD_LENGTH) {
          setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
          return;
        }
        setBusy(true);
        const { error } = await createClient().auth.updateUser({ password });
        setBusy(false);
        if (error) setError(error.message);
        else setState("done");
      }}
    >
      <div className="mark authmark">F</div>
      <h1 className="h1">Choose a new password</h1>
      <label className="authfield">
        <span>New password</span>
        <input type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p className="autherr">{error}</p>}
      <button className="btn primary" type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="authwrap">
      <Suspense fallback={null}>
        <ResetPassword />
      </Suspense>
    </div>
  );
}
