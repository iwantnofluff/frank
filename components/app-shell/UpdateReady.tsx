"use client";

import { useState } from "react";
import { useDeployedVersion } from "@/hooks/use-deployed-version";
import { CURRENT_RELEASE } from "@/lib/releases";
import { compareVersions, displayVersion } from "@/lib/release-version";

// A newer version of Frank has gone live while this tab was open (direct
// instruction): say so, with Reload, so nobody keeps working on the old
// one. Later is for now only; it asks again on the next page load.
export function UpdateReady() {
  const { data: deployed } = useDeployedVersion();
  const [later, setLater] = useState(false);
  if (!deployed || later || compareVersions(deployed, CURRENT_RELEASE.version) >= 0) return null;
  return (
    <div className="updready" role="status">
      <span>
        <b>Frank {displayVersion(deployed)} is ready.</b> Reload to get it.
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
