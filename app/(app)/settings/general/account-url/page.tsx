"use client";

import { useState } from "react";
import { useMyAgency } from "@/hooks/use-my-agency";
import { SettingsHead } from "@/components/settings/SettingsHead";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "beingfrank.app";

// The agency's own address (phase36). Shown, not changed here (decided
// directly): every invite and review link already sent uses it, so a
// change is made by Frank, from the admin area.
export default function AccountUrlPage() {
  const { data: agency } = useMyAgency();
  const [copied, setCopied] = useState(false);
  const url = agency?.subdomain ? `https://${agency.subdomain}.${ROOT}` : null;
  return (
    <div className="pad" style={{ maxWidth: 1100 }}>
      <SettingsHead title="Account URL" description="Where your team and your clients sign in to your agency's Frank." />
      <div className="panel">
        <div className="panel-h">
          <b>Account URL</b>
        </div>
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
      </div>
      <p className="sub">To change your address, contact Frank. Links you&rsquo;ve already sent use the current one.</p>
    </div>
  );
}
