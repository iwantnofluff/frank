"use client";

import { AuthPanel } from "@/components/ui/AuthPanel";
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
      <AuthPanel title="This Link Has Expired" sub="Reset links work once, for an hour. Ask for a new one.">
        <a className="btn primary" href="/forgot-password">
          Send a new link
        </a>
      </AuthPanel>
    );
  }
  if (state === "done") {
    return (
      <AuthPanel title="Password Changed" sub="You\u2019re signed in with your new password.">
        <a className="btn primary" href="/dashboard">
          Continue
        </a>
      </AuthPanel>
    );
  }
  return (
    <AuthPanel title="Choose a New Password">
    <form
      className="signform"
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
      <label className="authfield">
        <span>New password</span>
        <input type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p className="autherr">{error}</p>}
      <button className="btn primary" type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save password"}
      </button>
    </form>
    </AuthPanel>
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
