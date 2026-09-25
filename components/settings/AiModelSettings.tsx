"use client";

import { useState } from "react";
import { useAgencyAiSettings, type AgencyAiSettings } from "@/hooks/use-agency-ai-settings";
import { useUpdateAgencyAiModel } from "@/hooks/use-update-agency-ai-model";
import { AI_MODELS } from "@/lib/ai/models";
import { errorMessage } from "@/lib/errors";

// The model an agency drafts with — a cost-affecting setting (platform
// pays for every call), so it lives here rather than as a per-draft
// picker: changed rarely, by an admin, not chosen fresh each time someone
// clicks Draft. Whatever's saved here is what "Draft from Brief"
// (ChecksAndDraft.tsx) actually uses (resolved server-side, not sent by
// the client — see app/api/ai/draft/route.ts).
export function AiModelSettings({ agencyId }: { agencyId: string | undefined }) {
  const { data: settings, isLoading, isError } = useAgencyAiSettings(agencyId);

  return (
    <div className="panel">
      <div className="panel-h">
        <b>Drafting Model</b>
      </div>

      {isError && (
        <div className="bsec">
          <p className="autherr">Couldn&rsquo;t load this setting</p>
        </div>
      )}

      {/* AiModelForm only mounts once settings has actually loaded, so its
          local state can initialise straight from a real value — no effect
          needed to sync it in afterward. */}
      {!isError && !isLoading && settings && (
        <AiModelForm agencyId={agencyId} settings={settings} />
      )}
    </div>
  );
}

function AiModelForm({
  agencyId,
  settings,
}: {
  agencyId: string | undefined;
  settings: AgencyAiSettings;
}) {
  const [model, setModel] = useState(settings.ai_default_model);
  const update = useUpdateAgencyAiModel(agencyId);
  const dirty = model !== settings.ai_default_model;

  return (
    <>
      <div className="bsec">
        <div className="bl">Model</div>
        <select className="bin one" value={model} onChange={(e) => setModel(e.target.value)}>
          {AI_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label} — {m.tierLabel}
            </option>
          ))}
        </select>
        <p className="sub" style={{ marginTop: 6 }}>
          Every AI draft across this agency uses this model. The platform
          covers usage up to the agency&rsquo;s monthly cap (
          {settings.ai_monthly_request_cap} requests).
        </p>
      </div>
      <div className="bfoot">
        <button
          type="button"
          className="btn primary sm"
          disabled={!dirty || update.isPending}
          onClick={() => update.mutate(model)}
        >
          {update.isPending ? "Saving…" : "Save"}
        </button>
        {update.isSuccess && !dirty && <span className="bsaved">Saved</span>}
        {update.error && (
          <span className="berr">{errorMessage(update.error, "Couldn't save")}</span>
        )}
      </div>
    </>
  );
}
