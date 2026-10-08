"use client";

import { use, useEffect, useState, useSyncExternalStore } from "react";
import { applyTheme, normaliseTheme } from "@/lib/theme";
import { useReviewController } from "@/hooks/use-review-controller";
import { MobileReview } from "@/components/review/MobileReview";
import { DesktopReview } from "@/components/review/DesktopReview";

function PasscodeGate({
  onSubmit,
  invalid,
}: {
  onSubmit: (code: string) => void;
  invalid: boolean;
}) {
  const [code, setCode] = useState("");

  return (
    <div className="authwrap" style={{ background: "#101318" }}>
      <form
        className="authcard"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(code);
        }}
      >
        <h1 className="h1">This link needs a passcode</h1>
        <p className="sub">Ask whoever sent it for the code.</p>
        <label className="field">
          <span>Passcode</span>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoFocus
          />
        </label>
        {invalid && <p className="autherr">That passcode isn&rsquo;t right.</p>}
        <button className="btn primary" type="submit">
          Continue
        </button>
      </form>
    </div>
  );
}

function UnavailableNotice() {
  return (
    <div className="authwrap" style={{ background: "#101318" }}>
      <div className="authcard" style={{ textAlign: "center" }}>
        <h1 className="h1">This link isn&rsquo;t available</h1>
        <p className="sub">
          It may have expired, been revoked, or never existed. Ask whoever
          sent it for a fresh one.
        </p>
      </div>
    </div>
  );
}

// The visitor's own screen picks the layout (direct instruction): a phone's
// browser gets the phone layout, filling it; anything wider, the desktop one,
// filling the window. No frame, no preview switch.
const PHONE_QUERY = "(max-width: 899px)";
function subscribe(onChange: () => void) {
  const mq = window.matchMedia(PHONE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
function usePhoneScreen() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}

export default function SharedReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const controller = useReviewController(token);
  const { data, isLoading, isError, setPasscode } = controller;
  const phone = usePhoneScreen();

  // The agency's colours, applied the same way the signed-in app applies
  // them; an agency with no saved theme keeps Frank's default.
  const branding = data?.status === "ok" ? data.branding : null;
  useEffect(() => {
    if (branding?.theme) applyTheme(normaliseTheme(branding.theme));
  }, [branding?.theme]);

  if (isLoading) {
    return (
      <div className="reviewpage">
        <p className="reviewpage-loading">Frank is working…</p>
      </div>
    );
  }

  if (isError || !data || data.status === "not_found") {
    return <UnavailableNotice />;
  }

  if (data.status === "passcode_required") {
    return (
      <PasscodeGate
        invalid={!!data.invalid}
        onSubmit={(code) => setPasscode(code)}
      />
    );
  }

  // The client's name heads the page and is the phone's handle (direct
  // instruction: it was missing); the project's name sits under it.
  const projectName = data.project.name;
  const clientName = data.client_name ?? projectName;
  const agencyName = data.agency_name ?? "";

  return (
    <div className="reviewpage">
      {phone ? (
        <MobileReview controller={controller} clientName={clientName} projectName={projectName} agencyName={agencyName} logoUrl={branding?.logo_url ?? null} shown />
      ) : (
        <DesktopReview controller={controller} clientName={clientName} projectName={projectName} agencyName={agencyName} logoUrl={branding?.logo_url ?? null} shown />
      )}
    </div>
  );
}
