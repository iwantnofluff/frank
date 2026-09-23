"use client";

import { useState, type SubmitEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
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
      <h1 className="h1">Hey, sign in to Frank</h1>
      <p className="sub">Use the account your agency invited you with.</p>

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
    </form>
  );
}
