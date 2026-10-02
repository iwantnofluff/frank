"use client";

import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="authwrap">
      <form
        className="authcard"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          const res = await fetch("/api/auth/forgot-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
          });
          setBusy(false);
          if (res.ok) setSent(true);
          else setError((await res.json().catch(() => ({}))).error ?? "Couldn't send the email");
        }}
      >
        <div className="mark authmark">F</div>
        <h1 className="h1">Reset your password</h1>
        {sent ? (
          <p className="sub">
            If {email} has a Frank account, a link to set a new password is on its way. It works for an hour.
          </p>
        ) : (
          <>
            <p className="sub">Enter your email and we&rsquo;ll send you a link to set a new password.</p>
            <label className="authfield">
              <span>Email</span>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            {error && <p className="autherr">{error}</p>}
            <button className="btn primary" type="submit" disabled={busy}>
              {busy ? "Sending…" : "Send the link"}
            </button>
          </>
        )}
        <a className="authlink" href="/login">
          Back to sign in
        </a>
      </form>
    </div>
  );
}
