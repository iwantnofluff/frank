"use client";

import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function AccessRemoved() {
  const agency = useSearchParams().get("agency");

  useEffect(() => {
    createClient().auth.signOut();
  }, []);

  return (
    <div className="authcard">
      <div className="mark authmark">F</div>
      <h1 className="h1">Access removed</h1>
      <p className="sub">
        {agency ? `Your access to ${agency} on Frank` : "Your access to Frank"} has been turned off.
        Contact an Owner at your agency if you think this is a mistake.
      </p>
      <Link className="btn primary" href="/login" style={{ textAlign: "center" }}>
        Back to sign in
      </Link>
    </div>
  );
}

export default function AccessRemovedPage() {
  return (
    <div className="authwrap">
      <Suspense fallback={null}>
        <AccessRemoved />
      </Suspense>
    </div>
  );
}
