"use client";

import { use, useState } from "react";
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

export default function SharedReviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const controller = useReviewController(token);
  const { data, isLoading, isError, setPasscode } = controller;
  // Matches the prototype's own default (`let shareView="phone"`) exactly —
  // not a responsive guess at the visitor's actual device. See
  // docs/parity-gaps.md for why that's a deliberate, disclosed change from
  // this page's previous behaviour.
  const [view, setView] = useState<"phone" | "desktop">("phone");

  if (isLoading) {
    return (
      <div className="phonewrap">
        <p style={{ color: "#fff" }}>Loading…</p>
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

  const agencyName = data.project.name;
  const linkUrl =
    typeof window !== "undefined" ? window.location.href : `/review/${token}`;

  return (
    <div className={`phonewrap${view === "desktop" ? " desk" : ""}`}>
      <div className="pw-side">
        <b>Shared review</b>
        <span>
          This is what the client opens. The link works on any phone; no
          account is needed to read the work or the comments.
        </span>
        <div className="pw-seg">
          <button
            type="button"
            data-sv="phone"
            aria-pressed={view === "phone"}
            onClick={() => setView("phone")}
          >
            Phone
          </button>
          <button
            type="button"
            data-sv="desktop"
            aria-pressed={view === "desktop"}
            onClick={() => setView("desktop")}
          >
            Desktop
          </button>
        </div>
      </div>
      <MobileReview controller={controller} agencyName={agencyName} />
      <DesktopReview
        controller={controller}
        agencyName={agencyName}
        linkUrl={linkUrl}
      />
    </div>
  );
}
