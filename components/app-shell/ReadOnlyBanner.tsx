"use client";

import Link from "next/link";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { isReadOnly } from "@/lib/plans";
import { seesAllClients } from "@/lib/roles";

// Free's trial is over (phase41): everything is readable, nothing changes.
// The database enforces it; this says so, on every page, before anyone
// tries.
export function ReadOnlyBanner() {
  const { data: agency } = useMyAgency();
  const { data: me } = useMyMembership(agency?.agencyId);
  if (!agency || !isReadOnly(agency.plan, agency.trialEndsAt)) return null;
  const isClient = !!me?.client_id;
  const canChoose = !isClient && seesAllClients(me?.role);
  return (
    <div className="robanner" role="status">
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16h.01" />
      </svg>
      <span>
        {isClient
          ? `${agency.name}'s workspace is read-only for now, so comments and approvals are paused.`
          : `${agency.name}'s free trial has ended, so Frank is read-only: everything is still here, but nothing can be added or changed.`}
      </span>
      {canChoose ? (
        <Link className="btn sm" href="/settings/plan/plans">
          Choose a Plan
        </Link>
      ) : (
        !isClient && <span>Ask an Admin or Owner to choose a plan.</span>
      )}
    </div>
  );
}
