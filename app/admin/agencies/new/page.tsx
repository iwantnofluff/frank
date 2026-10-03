"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCreateAgency } from "@/hooks/use-admin-agencies";
import { errorMessage } from "@/lib/errors";
import { ROOT_DOMAIN } from "@/lib/tenant";

// A new agency at its own address, with its Primary Owner invited there.
export default function NewAgencyPage() {
  const router = useRouter();
  const create = useCreateAgency();
  const [name, setName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [warning, setWarning] = useState<string | null>(null);

  return (
    <form
      className="adminform"
      onSubmit={async (e) => {
        e.preventDefault();
        const result = await create.mutateAsync({ name, subdomain, ownerEmail }).catch(() => null);
        if (!result) return;
        if (result.warning) setWarning(result.warning);
        else router.push(`/admin/agencies/${result.agencyId}`);
      }}
    >
      <h1 className="h1">New Agency</h1>
      <p className="sub">
        The owner gets an invite to the agency&rsquo;s own address, as its Primary Owner. It starts on Free, with its
        30-day trial, and chooses its own plan.
      </p>
      <div className="field">
        <label htmlFor="agName">Agency Name</label>
        <input id="agName" className="bin one" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="agSub">
          Address <span className="hint">lower-case letters, numbers and hyphens</span>
        </label>
        <div className="subfield">
          <input
            id="agSub"
            className="bin one"
            required
            value={subdomain}
            onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
          />
          <span>.{ROOT_DOMAIN}</span>
        </div>
      </div>
      <div className="field">
        <label htmlFor="agOwner">Primary Owner&rsquo;s Email</label>
        <input id="agOwner" type="email" className="bin one" required value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />
      </div>
      {create.error && <p className="autherr">{errorMessage(create.error, "Couldn't create the agency")}</p>}
      {warning && <p className="autherr">{warning}</p>}
      <div className="confirm-acts">
        <button type="button" className="btn" onClick={() => router.push("/admin")}>
          Cancel
        </button>
        <button type="submit" className="btn primary" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create Agency"}
        </button>
      </div>
    </form>
  );
}
