"use client";

import { use, useState, type SubmitEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAcceptInvite, useInvite } from "@/hooks/use-invite";
import { errorMessage } from "@/lib/errors";
import { MIN_PASSWORD_LENGTH } from "@/lib/invites/constants";
import { ROLE_LABELS } from "@/lib/roles";

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="authcard">
      <div className="mark authmark">F</div>
      <h1 className="h1">{title}</h1>
      <p className="sub">{body}</p>
      <Link className="btn primary" href="/login" style={{ textAlign: "center" }}>
        Go to sign in
      </Link>
    </div>
  );
}

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const { data: invite, isLoading, isError } = useInvite(token);
  const accept = useAcceptInvite(token);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (invite?.status !== "ok") return;
    setError(null);
    if (invite.needsPassword) {
      if (!name.trim()) return setError("Enter your name");
      if (password.length < MIN_PASSWORD_LENGTH) {
        return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters for your password`);
      }
    }
    try {
      const result = await accept.mutateAsync(
        invite.needsPassword ? { name: name.trim(), password } : {},
      );
      if (!result.needsPassword) {
        router.push("/login?redirect_to=/dashboard");
        return;
      }
      const { error: signInError } = await createClient().auth.signInWithPassword({
        email: result.email,
        password,
      });
      if (signInError) throw signInError;
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err, "Couldn't accept the invite"));
    }
  }

  let content: React.ReactNode = null;
  if (isError || invite?.status === "not_found") {
    content = (
      <Notice
        title="This invite link isn't valid"
        body="Check you used the whole link from the email, or ask whoever invited you to send a new one."
      />
    );
  } else if (invite?.status === "expired") {
    content = (
      <Notice
        title="This invite has expired"
        body="Invite links last 48 hours. Ask whoever invited you to send a new one."
      />
    );
  } else if (invite?.status === "accepted") {
    content = <Notice title="You've already joined" body="This invite has been used. Sign in to continue." />;
  } else if (invite?.status === "ok") {
    content = (
      <form className="authcard" onSubmit={handleSubmit}>
        <div className="mark authmark">F</div>
        <h1 className="h1">Join {invite.agencyName} on Frank</h1>
        <p className="sub">
          You&rsquo;ve been invited as {ROLE_LABELS[invite.role]}.{" "}
          {invite.needsPassword
            ? "Choose your name and a password to finish setting up."
            : `You already have a Frank account as ${invite.email} — accept, then sign in as usual.`}
        </p>

        {invite.needsPassword && (
          <>
            <label className="authfield">
              <span>Email</span>
              <input type="email" value={invite.email} readOnly disabled />
            </label>
            <label className="authfield">
              <span>Your name</span>
              <input
                autoComplete="name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="authfield">
              <span>Password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          </>
        )}

        {error && <p className="autherr">{error}</p>}

        <button className="btn primary" type="submit" disabled={accept.isPending}>
          {accept.isPending ? "Joining…" : invite.needsPassword ? "Create account" : "Accept invite"}
        </button>
      </form>
    );
  }

  return <div className="authwrap">{isLoading ? null : content}</div>;
}
