"use client";

import { useState } from "react";
import { SettingsHead } from "@/components/settings/SettingsHead";
import { useChangeAdminPassword, useSignOutOtherSessions, useStartAdminEmailChange } from "@/hooks/use-admin-me";
import { MIN_PASSWORD_LENGTH } from "@/lib/invites/constants";
import { errorMessage } from "@/lib/errors";

// The platform admin's password, sign-in email, and other sessions.
export default function AdminSecurityPage() {
  return (
    <div style={{ maxWidth: 760 }}>
      <SettingsHead title="Password & Security" description="How you sign in to Frank Admin." />
      <PasswordPanel />
      <EmailPanel />
      <SessionsPanel />
    </div>
  );
}

function PasswordPanel() {
  const change = useChangeAdminPassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <form
      className="panel adminpanel"
      onSubmit={(e) => {
        e.preventDefault();
        if (next.length < MIN_PASSWORD_LENGTH) return setProblem(`Use at least ${MIN_PASSWORD_LENGTH} characters for the new password`);
        if (next !== again) return setProblem("The new passwords don't match");
        setProblem(null);
        change.mutate(
          { current, next },
          {
            onSuccess: () => {
              setCurrent("");
              setNext("");
              setAgain("");
            },
          },
        );
      }}
    >
      <div className="panel-h">
        <b>Password</b>
      </div>
      <div className="adminpanel-b">
        <label className="authfield">
          <span>Current password</span>
          <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label className="authfield">
          <span>New password</span>
          <input type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        <label className="authfield">
          <span>New password again</span>
          <input type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} />
        </label>
        {(problem || change.error) && <p className="autherr">{problem ?? errorMessage(change.error, "Couldn't change it")}</p>}
        {change.isSuccess && <p className="bsaved">Password changed.</p>}
        <div>
          <button type="submit" className="btn primary" disabled={change.isPending}>
            {change.isPending ? "Changing…" : "Change Password"}
          </button>
        </div>
      </div>
    </form>
  );
}

function EmailPanel() {
  const start = useStartAdminEmailChange();
  const [email, setEmail] = useState("");
  const [current, setCurrent] = useState("");
  return (
    <form
      className="panel adminpanel"
      onSubmit={(e) => {
        e.preventDefault();
        start.mutate({ email, current }, { onSuccess: () => setCurrent("") });
      }}
    >
      <div className="panel-h">
        <b>Sign-in email</b>
      </div>
      <div className="adminpanel-b">
        <p className="sub">
          We&rsquo;ll send a link to the new address. Nothing changes until it&rsquo;s followed, and your current address
          is told when it does.
        </p>
        <label className="authfield">
          <span>New email</span>
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="authfield">
          <span>Current password</span>
          <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        {start.error && <p className="autherr">{errorMessage(start.error, "Couldn't send the link")}</p>}
        {start.data && <p className="bsaved">Check {start.data.sentTo} for the link. It works for an hour.</p>}
        <div>
          <button type="submit" className="btn primary" disabled={start.isPending}>
            {start.isPending ? "Sending…" : "Send Confirmation Link"}
          </button>
        </div>
      </div>
    </form>
  );
}

function SessionsPanel() {
  const out = useSignOutOtherSessions();
  return (
    <div className="panel">
      <div className="srow">
        <span className="sl">
          <b>Other sessions</b>
          <span>Signs this account out everywhere except this browser.</span>
        </span>
        <button type="button" className="btn sm" disabled={out.isPending} onClick={() => out.mutate()}>
          {out.isPending ? "Signing out…" : out.isSuccess ? "Done" : "Sign Out Everywhere Else"}
        </button>
      </div>
      {out.error && <p className="autherr">{errorMessage(out.error, "Couldn't sign the others out")}</p>}
    </div>
  );
}
