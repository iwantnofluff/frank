"use client";

import { useRef, useState } from "react";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { useAgencySettings } from "@/hooks/use-agency-settings";
import { useAvatarUrls } from "@/hooks/use-avatar-urls";
import { useSetAgencyLogo } from "@/hooks/use-agency-logo";
import { PhotoCropModal } from "@/components/profile/PhotoCropModal";
import { AVATAR_TYPES, validateAvatarSource } from "@/lib/upload-avatar";
import { brandingAllowed } from "@/lib/plans";
import { seesAllClients } from "@/lib/roles";
import { errorMessage } from "@/lib/errors";

// The header's left (direct instruction): after Frank's logo, which sits
// in the corner above the rail (NavRail), a divider, then the agency's own
// logo. Without one, its initial; Owners and Admins on a branded plan can
// add one from here, straight into choosing and cropping it.
export function HeaderBrand() {
  const { data: agency } = useMyAgency();
  const { data: me } = useMyMembership(agency?.agencyId);
  const { data: settings, isPending: settingsPending } = useAgencySettings(agency?.agencyId);
  const { data: logoUrls } = useAvatarUrls([settings?.logo_asset_id]);
  const branded = brandingAllowed(agency?.plan);
  // Growth and up (phase41); below that, the initial whatever was saved.
  const logoUrl = settings?.logo_asset_id && branded ? logoUrls?.[settings.logo_asset_id] : undefined;
  const canAdd = branded && !!me && me.client_id === null && seesAllClients(me.role);
  const setLogo = useSetAgencyLogo(agency?.agencyId ?? "");
  const input = useRef<HTMLInputElement>(null);
  const [cropping, setCropping] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const initial = (agency?.name ?? "").trim().charAt(0).toUpperCase() || "F";

  return (
    <div className="hbrand">
      {agency && (
        <>
          <span className="hbrand-sep" aria-hidden="true" />
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
            <img className="hbrand-agency" src={logoUrl} alt={agency.name} title={agency.name} />
          ) : settingsPending || (branded && settings?.logo_asset_id) ? (
            // Not known yet, or a logo on its way: blank, never the initial
            // first (direct instruction: no logo flashing in).
            <span className="hbrand-agency hbrand-wait" aria-hidden="true" />
          ) : (
            <span className="hbrand-agency hbrand-initial" title={agency.name}>
              {initial}
            </span>
          )}
          {!logoUrl && !settingsPending && !settings?.logo_asset_id && canAdd && !setLogo.isPending && (
            <button type="button" className="hbrand-add" onClick={() => input.current?.click()}>
              Add Logo
            </button>
          )}
          {setLogo.isPending && <span className="hbrand-add">Uploading…</span>}
          {(problem || setLogo.error) && (
            <span className="hbrand-err" role="status">
              {problem ?? errorMessage(setLogo.error, "Couldn't add the logo")}
            </span>
          )}
          <input
            ref={input}
            type="file"
            accept={AVATAR_TYPES.join(",")}
            aria-label="Add Logo file"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const bad = validateAvatarSource(file);
              setProblem(bad);
              if (!bad) setCropping(file);
            }}
          />
          {cropping && (
            <PhotoCropModal
              file={cropping}
              detectFaces={false}
              title="Position the agency logo"
              onCancel={() => setCropping(null)}
              onConfirm={(cropped) => {
                setCropping(null);
                setLogo.mutate(cropped);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
