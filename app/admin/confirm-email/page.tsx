"use client";

import { Suspense, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useConfirmAdminEmailChange } from "@/hooks/use-admin-me";
import { errorMessage } from "@/lib/errors";

// Opened from the link sent to a platform admin's new address.
function Confirm() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const confirm = useConfirmAdminEmailChange();
  // Once only: in development React runs effects twice.
  const tried = useRef(false);
  useEffect(() => {
    if (!token || tried.current) return;
    tried.current = true;
    confirm.mutate(token, { onSuccess: () => router.refresh() });
  }, [token, confirm, router]);

  if (!token) return <p className="autherr">This link is missing its code.</p>;
  if (confirm.error) return <p className="autherr">{errorMessage(confirm.error, "Couldn't confirm the email")}</p>;
  if (confirm.data) return <p className="bsaved">Done: you now sign in to Frank Admin as {confirm.data.email}.</p>;
  return <p className="sub">Confirming…</p>;
}

export default function AdminConfirmEmailPage() {
  return (
    <div style={{ maxWidth: 760 }}>
      <h1 className="h1">Sign-in email</h1>
      <Suspense fallback={null}>
        <Confirm />
      </Suspense>
    </div>
  );
}
