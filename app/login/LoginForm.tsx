"use client";

import { useState, type SubmitEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// On an agency's own address the page names it (workspaceName); elsewhere
// it's plain Frank.
export function LoginForm({
  workspaceName = null,
  adminArea = false,
}: {
  workspaceName?: string | null;
  // admin.beingfrank.app (phase37).
  adminArea?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }

    router.push(searchParams.get("redirect_to") || "/dashboard");
    router.refresh();
  }

  return (
    <form className="authcard" onSubmit={handleSubmit}>
      <div className="mark authmark">F</div>
      <h1 className="h1">
        {adminArea ? "Frank Admin" : workspaceName ? `Hey, sign in to ${workspaceName}` : "Hey, sign in to Frank"}
      </h1>
      <p className="sub">
        {adminArea
          ? "For Frank's platform admins only."
          : workspaceName
            ? `${workspaceName}'s Frank workspace. Use the account they invited you with.`
            : "Use the account your agency invited you with."}
      </p>

      <label className="authfield">
        <span>Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          suppressHydrationWarning
        />
      </label>

      <label className="authfield">
        <span>Password</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          suppressHydrationWarning
        />
      </label>

      {error && <p className="autherr">{error}</p>}

      <button className="btn primary" type="submit" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </button>
      <a className="authlink" href="/forgot-password">
        Forgot password?
      </a>
    </form>
  );
}
