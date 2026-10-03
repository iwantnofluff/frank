"use client";

import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { useAgencySettings } from "@/hooks/use-agency-settings";
import { seesAllClients } from "@/lib/roles";
import { BrandForm, type BrandPart } from "./BrandForm";
import { SettingsHead } from "./SettingsHead";
import Link from "next/link";
import { brandingAllowed } from "@/lib/plans";

// A Settings page showing one part of the agency's look (BrandForm).
export function BrandPartPage({ part, title, description }: { part: BrandPart; title: string; description: string }) {
  const { data: agency } = useMyAgency();
  const { data: me } = useMyMembership(agency?.agencyId);
  const { data: settings, isLoading } = useAgencySettings(agency?.agencyId);
  // Logo and colours are Growth and up (the spec's white-label row;
  // phase41). The name isn't branding.
  const locked = part !== "name" && !!agency && !brandingAllowed(agency.plan);
  const canEdit = me?.client_id === null && seesAllClients(me?.role) && !locked;
  return (
    <div className="pad" style={{ maxWidth: 1100 }}>
      <SettingsHead title={title} description={description} />
      {locked && (
        <div className="note">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 16v-5M12 8h.01" />
          </svg>
          <div>
            Your logo and colours show to your team and clients on Growth and up. On your plan, Frank&rsquo;s own look is
            used; anything already saved here comes back when you move up. <Link href="/settings/plan/plans">See the plans</Link>
          </div>
        </div>
      )}
      {agency && !isLoading && (
        <BrandForm part={part} agencyId={agency.agencyId} agencyName={agency.name} settings={settings ?? null} canEdit={canEdit} locked={locked} />
      )}
    </div>
  );
}
