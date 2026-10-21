"use client";

import { AuthPanel } from "@/components/ui/AuthPanel";
import { Suspense, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { forgetSignedUrls } from "@/hooks/use-avatar-urls";

function AccessRemoved() {
  const agency = useSearchParams().get("agency");

  useEffect(() => {
    createClient().auth.signOut();
    forgetSignedUrls();
  }, []);

  return (
    <AuthPanel title={<>Access removed</>} sub={<>{agency ? `Your access to ${agency} on Frank` : "Your access to Frank"} has been turned off. Contact an Owner of your workspace if you think this is a mistake.</>}>
      <Link className="btn primary" href="/login">
        Back to sign in
      </Link>
    </AuthPanel>
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
