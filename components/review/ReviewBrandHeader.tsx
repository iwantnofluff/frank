import type { ReactNode } from "react";

// The top of a review link (direct instruction): Frank's logo with its
// strapline, a divider and the agency's logo, as the app's own header has
// them; then the client's logo, its name, and the project and how many
// posts it holds. Logos are round, as everywhere in Frank; without one, an
// initial in its place.
export function ReviewBrandHeader({
  agencyName,
  agencyLogoUrl,
  clientName,
  clientLogoUrl,
  detail,
  aside,
}: {
  agencyName: string;
  agencyLogoUrl: string | null;
  clientName: string;
  clientLogoUrl: string | null;
  detail: string;
  // Anything at the end of the client's row (the phone's "1 / 3").
  aside?: ReactNode;
}) {
  return (
    <div className="rv-head">
      <div className="rv-brand">
        {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG, drawn as is */}
        <img className="rv-frank" src="/brand/frank-header-strapline.svg" alt="Frank" />
        <span className="rv-sep" aria-hidden="true" />
        <Round url={agencyLogoUrl} name={agencyName} className="rv-agency" />
      </div>
      <div className="rv-client">
        <Round url={clientLogoUrl} name={clientName} className="rv-clogo" />
        <div className="rv-client-t">
          <b>{clientName}</b>
          <span>{detail}</span>
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
