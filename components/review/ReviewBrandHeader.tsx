import type { ReactNode } from "react";
import { BRAND } from "@/lib/brand";
import { GatedLink } from "./GatedLink";

// The top of a review link (direct instruction): Frank's logo with its
// strapline, a divider and the agency's logo, as the app's own header has
// them; then the client's name (no logo: too many logos, direct
// instruction), and the project and how many posts it holds. The agency's
// logo is round, as everywhere in Frank; without one, its initial. The
// client's and project's names open their pages in Frank (direct
// instruction), asking anyone signed out to sign in first.
export function ReviewBrandHeader({
  agencyName,
  agencyLogoUrl,
  clientName,
  clientId,
  projectName,
  projectId,
  count,
  aside,
}: {
  agencyName: string;
  agencyLogoUrl: string | null;
  clientName: string;
  clientId: string | null;
  projectName: string;
  projectId: string | null;
  // After the project: "· 3 posts".
  count?: string;
  // Anything at the end of the client's row (the phone's "1 / 3").
  aside?: ReactNode;
}) {
  return (
    <div className="rv-head">
      <div className="rv-brand">
        {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG, drawn as is */}
        <img className="rv-frank" src={BRAND.headerStrapline} alt="Frank" />
        <span className="rv-sep" aria-hidden="true" />
        <Round url={agencyLogoUrl} name={agencyName} className="rv-agency" />
      </div>
      <div className="rv-client">
        <div className="rv-client-t">
          <b>
            {clientId ? (
              <GatedLink href={`/clients/${clientId}`} what={clientName} workspaceName={agencyName}>
                {clientName}
              </GatedLink>
            ) : (
              clientName
            )}
          </b>
          <span>
            {projectId ? (
              <GatedLink href={`/projects/${projectId}`} what={projectName} workspaceName={agencyName}>
                {projectName}
              </GatedLink>
            ) : (
              projectName
            )}
            {count && ` · ${count}`}
          </span>
        </div>
        {aside}
      </div>
    </div>
  );
}

function Round({ url, name, className }: { url: string | null; name: string; className: string }) {
  return (
    <span className={className} title={name}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
        <img src={url} alt={name} />
      ) : (
        name.trim().slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
