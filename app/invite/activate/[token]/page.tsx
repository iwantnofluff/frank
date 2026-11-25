"use client";

import { use, useState, type SubmitEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useActivateInvite, useInvite } from "@/hooks/use-invite";
import { errorMessage } from "@/lib/errors";
import { AuthPanel } from "@/components/ui/AuthPanel";

// Where an account made from a review link is switched on (direct
// instruction): the email's link opens this, the email filled in, and
// logging in with the password chosen on the link activates it; then back
// to the review link, signed in. Only the address's owner gets the link and
// only the person who chose the password knows it, so both together are
// what turns the account on (app/api/invite/activate).
function Notice({ title, body }: { title: string; body: string }) {
  return (
    <AuthPanel title={title} sub={body}>
      <Link className="btn primary" href="/login">
        Go to sign in
      </Link>
    </AuthPanel>
  );
}

export default function ActivatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const searchParams = useSearchParams();
  // Only ever back to a review link on this site.
  const backParam = searchParams.get("back");
  const back = backParam && /^\/review\/[A-Za-z0-9/_-]+$/.test(backParam) ? backParam : null;
  const { data: invite, isLoading, isError } = useInvite(token);
  const activate = useActivateInvite(token);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (invite?.status !== "ok") return;
    setError(null);
    setBusy(true);
    const { error: signInError } = await createClient().auth.signInWithPassword({ email: invite.email, password });
    if (signInError) {
      setBusy(false);
      setError("That isn't the password chosen for this account.");
      return;
    }
    try {
      const { clientId } = await activate.mutateAsync();
      // A full load, so the review link reads the new session.
      window.location.assign(back ?? (clientId ? `/clients/${clientId}` : "/dashboard"));
    } catch (err) {
      setBusy(false);
      setError(errorMessage(err, "Couldn't activate your account"));
    }
  }

  let content: React.ReactNode = null;
  if (isError || invite?.status === "not_found") {
    content = (
      <Notice title="This link isn't valid" body="Check you used the whole link from the email, or create your account again from the review link." />
    );
  } else if (invite?.status === "expired") {
    content = <Notice title="This link has expired" body="Links last 3 months. Create your account again from the review link." />;
  } else if (invite?.status === "accepted") {
    content = <Notice title="Your account is already active" body="Sign in to continue." />;
  } else if (invite?.status === "ok") {
    content = (
      <AuthPanel
        title="Activate your account"
        sub={`Log in with the password you chose${invite.clientName ? ` to see all of ${invite.clientName}'s posts` : ""}.`}
      >
        <form className="signform" onSubmit={handleSubmit}>
          <label className="authfield">
            <span>Email</span>
            <input type="email" value={invite.email} readOnly disabled />
          </label>
          <label className="authfield">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p className="autherr">
              {error}{" "}
              <Link href="/forgot-password" style={{ color: "inherit", textDecoration: "underline" }}>
                Forgot your password?
              </Link>{" "}
              Then open this link again.
            </p>
          )}
          <button className="btn primary" type="submit" disabled={busy || !password}>
            {busy ? "Activating…" : "Activate and Log In"}
          </button>
        </form>
      </AuthPanel>
    );
  }
  return <div className="authwrap">{isLoading ? null : content}</div>;
}
