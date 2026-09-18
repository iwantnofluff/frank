"use client";

import { useState } from "react";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useAgencySettings, type AgencyTheme } from "@/hooks/use-agency-settings";
import { useUpdateAgencyBranding } from "@/hooks/use-update-agency-branding";

function BrandForm({
  agencyId,
  agencyName,
  theme,
}: {
  agencyId: string;
  agencyName: string;
  theme: AgencyTheme | undefined;
}) {
  // Initial values only — this component mounts once the data has actually
  // loaded (the parent gates on isLoading), so a lazy initializer is enough;
  // no effect needed to keep local edits in sync with a still-loading fetch.
  const [name, setName] = useState(agencyName);
  const [primary, setPrimary] = useState(theme?.action ?? "#007BFF");
  const [secondary, setSecondary] = useState(theme?.rail ?? "#003C61");

  const update = useUpdateAgencyBranding(agencyId);

  return (
    <div className="brief open" style={{ marginTop: 20 }}>
      <div className="bf-b" style={{ display: "block" }}>
        <div className="bsec">
          <div className="bl">Agency name</div>
          <input
            className="bin one"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="bsec bmeta">
          <div>
            <div className="bl">Primary colour</div>
            <input
              type="color"
              value={primary}
              onChange={(e) => setPrimary(e.target.value)}
              style={{
                width: 60,
                height: 34,
                padding: 0,
                border: "1px solid var(--line-2)",
                borderRadius: "var(--r)",
              }}
            />
          </div>
          <div>
            <div className="bl">Secondary colour</div>
            <input
              type="color"
              value={secondary}
              onChange={(e) => setSecondary(e.target.value)}
              style={{
                width: 60,
                height: 34,
                padding: 0,
                border: "1px solid var(--line-2)",
                borderRadius: "var(--r)",
              }}
            />
          </div>
        </div>

        <div className="bsec">
          <div className="bl">Logo</div>
          <div className="drop" style={{ cursor: "default", opacity: 0.6 }}>
            <svg viewBox="0 0 24 24">
              <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
              <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
            </svg>
            <b>Logo upload isn&rsquo;t wired up yet</b>
            <span>File storage lands in a later phase.</span>
          </div>
        </div>

        <div className="bfoot">
          <button
            type="button"
            className="btn primary sm"
            disabled={update.isPending || !name.trim()}
            onClick={() =>
              update.mutate({
                agencyName: name.trim(),
                primaryColour: primary,
                secondaryColour: secondary,
                currentTheme: theme,
              })
            }
          >
            {update.isPending ? "Saving…" : "Save"}
          </button>
          <div className="grow" />
          {update.isSuccess && <span className="bsaved">Saved</span>}
          {update.error && (
            <span className="berr">
              {update.error instanceof Error
                ? update.error.message
                : "Couldn't save"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function BrandSettingsPage() {
  const { data: agency } = useMyAgency();
  const { data: settings, isLoading } = useAgencySettings(agency?.agencyId);

  return (
    <div className="pad narrow">
      <h1 className="h1">Branding</h1>
      <p className="sub">
        Applied to the client-facing interface — topbar, buttons, and email
        headers.
      </p>

      {isLoading || !agency ? (
        <p className="sub" style={{ marginTop: 20 }}>
          Loading…
        </p>
      ) : (
        <BrandForm
          agencyId={agency.agencyId}
          agencyName={agency.name}
          theme={settings?.theme}
        />
      )}
    </div>
  );
}
