"use client";

import { useState } from "react";
import { useDeployedVersion } from "@/hooks/use-deployed-version";
import { CURRENT_RELEASE } from "@/lib/releases";
import { compareVersions, displayVersion } from "@/lib/release-version";

// A newer version of Frank has gone live while this tab was open (direct
// instruction): say so, with Reload, so nobody keeps working on the old
// one. Later is for now only; it asks again on the next page load. On a
// review link too (direct instruction: a client's open tab ran the old
// one), in the client's words and at the top, clear of the comment box.
export function UpdateReady({ onLink = false }: { onLink?: boolean }) {
  const { data: deployed } = useDeployedVersion();
  const [later, setLater] = useState(false);
  if (!deployed || later || compareVersions(deployed, CURRENT_RELEASE.version) >= 0) return null;
  return (
    <div className={onLink ? "updready on-link" : "updready"} role="status">
      <span>
        {onLink ? (
          <>
            <b>This page has been updated.</b> Reload to see the latest.
          </>
        ) : (
          <>
            <b>Frank {displayVersion(deployed)} is ready.</b> Reload to get it.
          </>
        )}
      </span>
      <button type="button" className="btn sm" onClick={() => setLater(true)}>
        Later
      </button>
      <button type="button" className="btn primary sm" onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  );
}
