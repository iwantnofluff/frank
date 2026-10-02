import { Suspense } from "react";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { tenantFromHost } from "@/lib/tenant";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  // On agencyname.beingfrank.app, sign-in names the agency (phase36's
  // workspace_for_subdomain shows only the name, before anyone signs in).
  const tenant = tenantFromHost((await headers()).get("host"));
  let workspaceName: string | null = null;
  if (tenant.kind === "agency") {
    const { data } = await (await createClient()).rpc("workspace_for_subdomain", { p_subdomain: tenant.subdomain });
    workspaceName = (data as { name: string }[] | null)?.[0]?.name ?? null;
  }
  return (
    <div className="authwrap">
      <Suspense fallback={null}>
        <LoginForm workspaceName={workspaceName} adminArea={tenant.kind === "admin"} />
      </Suspense>
    </div>
  );
}
