"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCreateAgency } from "@/hooks/use-admin-agencies";
import { errorMessage } from "@/lib/errors";
import { PLANS } from "@/lib/plans";

// A new agency at its own address, with its Primary Owner invited there.
export default function NewAgencyPage() {
  const router = useRouter();
  const create = useCreateAgency();
  const [name, setName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  // Decided directly: Free by default, so the agency can upgrade by card.
  const [plan, setPlan] = useState("free");
  const [warning, setWarning] = useState<string | null>(null);

  return (
    <form
      className="adminform"
      onSubmit={async (e) => {
        e.preventDefault();
        const result = await create.mutateAsync({ name, subdomain, ownerEmail, plan }).catch(() => null);
        if (!result) return;
        if (result.warning) setWarning(result.warning);
        else router.push(`/admin/agencies/${result.agencyId}`);
      }}
    >
      <h1 className="h1">New Agency</h1>
      <p className="sub">The owner gets an invite to the agency&rsquo;s own address, as its Primary Owner.</p>
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
          <span>.beingfrank.app</span>
        </div>
      </div>
      <div className="field">
        <label htmlFor="agOwner">Primary Owner&rsquo;s Email</label>
        <input id="agOwner" type="email" className="bin one" required value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="agNewPlan">
          Plan <span className="hint">Free starts a 30-day trial; the owner can then pay for a plan themselves</span>
        </label>
        <select id="agNewPlan" className="bin one" value={plan} onChange={(e) => setPlan(e.target.value)}>
          {PLANS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
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
