"use client";

import { useState } from "react";
import Link from "next/link";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { useChangeAddress } from "@/hooks/use-agency-address";
import { SettingsHead } from "@/components/settings/SettingsHead";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { customAddressAllowed } from "@/lib/plans";
import { isOwnerOrAbove } from "@/lib/roles";
import { hostWithSubdomain, tenantFromHost } from "@/lib/tenant";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "beingfrank.app";

// The agency's own address (phase36). Decided directly (phase41): an Owner
// changes it here, on Agency or Enterprise (the spec's custom subdomain
// row); everyone else sees it. The old address keeps working, redirecting
// to the new one.
export default function AccountUrlPage() {
  const { data: agency } = useMyAgency();
  const { data: me } = useMyMembership(agency?.agencyId);
  const change = useChangeAddress(agency?.agencyId);
  const [copied, setCopied] = useState(false);
  // null until edited: the box shows the current address.
  const [edited, setDraft] = useState<string | null>(null);
  const draft = edited ?? agency?.subdomain ?? "";
  const [confirming, setConfirming] = useState(false);

  const url = agency?.subdomain ? `https://${agency.subdomain}.${ROOT}` : null;
  const planAllows = customAddressAllowed(agency?.plan);
  const canChange = planAllows && me?.client_id === null && isOwnerOrAbove(me?.role);
  const dirty = draft !== "" && draft !== agency?.subdomain;

  async function save() {
    const result = await change.mutateAsync(draft).catch(() => null);
    if (!result) return;
    setConfirming(false);
    // On the agency's own address, go to the new one (sessions belong to an
    // address, so it asks to sign in there).
    const tenant = tenantFromHost(window.location.host);
    if (tenant.kind === "agency" && result.previous) {
      const host = hostWithSubdomain(window.location.host, result.previous, result.subdomain);
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- another host, not an internal page
      window.location.href = `${window.location.protocol}//${host}${window.location.pathname}`;
    }
  }

  return (
    <div className="pad" style={{ maxWidth: 1100 }}>
      <SettingsHead title="Account URL" description="Where your team and your clients sign in to your agency's Frank." />
      <div className="panel">
        <div className="panel-h">
          <b>Account URL</b>
        </div>
        {canChange ? (
          <div className="srow">
            <span className="sl">
              <b>Your address</b>
              <span>Lower-case letters, numbers and hyphens</span>
            </span>
            <span className="subfield">
              <input
                id="acctSub"
                className="bin one"
                aria-label="Address"
                value={draft}
                onChange={(e) => setDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              />
              <span>.{ROOT}</span>
            </span>
            <button type="button" className="btn primary sm" disabled={!dirty} onClick={() => setConfirming(true)}>
              Change
            </button>
          </div>
        ) : (
          <div className="srow">
            <span className="sl">
              <b>{url ? url.replace("https://", "") : "No address yet"}</b>
              <span>Invites and review links use this address.</span>
            </span>
            {url && (
              <button
                type="button"
                className="btn sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(url).catch(() => {});
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            )}
          </div>
        )}
      </div>
      {!planAllows ? (
        <p className="sub">
          Choosing your own address comes with the Agency plan. <Link href="/settings/plan/plans">See the plans</Link>
        </p>
      ) : (
        !canChange && <p className="sub">Only an Owner or the Primary Owner can change the address.</p>
      )}

      {confirming && (
        <ConfirmDialog
          tone="primary"
          title="Change your address?"
          message={`${agency?.name} moves to ${draft}.${ROOT}. Links already sent with ${agency?.subdomain}.${ROOT} keep working and lead to the new address, but everyone signs in again there.`}
          confirmLabel="Change Address"
          pendingLabel="Changing…"
          isPending={change.isPending}
          error={change.error}
          errorFallback="Couldn't change the address"
          onConfirm={save}
          onClose={() => {
            setConfirming(false);
            change.reset();
          }}
        />
      )}
    </div>
  );
}
