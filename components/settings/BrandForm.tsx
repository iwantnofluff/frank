"use client";

import { useEffect, useRef, useState } from "react";
import { useAgencySettings, type AgencySettingsRow } from "@/hooks/use-agency-settings";
import { useSaveBranding } from "@/hooks/use-save-branding";
import { useSetAgencyLogo } from "@/hooks/use-agency-logo";
import { useAvatarUrls } from "@/hooks/use-avatar-urls";
import { Modal } from "@/components/ui/Modal";
import { PhotoCropModal } from "@/components/profile/PhotoCropModal";
import { errorMessage } from "@/lib/errors";
import { AVATAR_TYPES, validateAvatarSource } from "@/lib/upload-avatar";
import {
  BUILT_IN_PRESETS,
  DEFAULT_THEME,
  HEX,
  matchPreset,
  normaliseTheme,
  presetTheme,
  sameColours,
  type Theme,
  type ThemeKey,
} from "@/lib/theme";
import { useThemeDraft } from "@/store/theme-draft-store";

const INTERFACE_COLOURS: [ThemeKey, string, string][] = [
  ["action", "Primary Action", "Buttons, links, active states and highlights"],
  ["rail", "Navigation Rail", "The dark bar down the left"],
  ["canvas", "Page Background", "Behind every panel"],
  ["surface", "Panel Surface", "Cards, tables and the review canvas"],
  ["ink", "Body Text", "Headings and primary text"],
  ["line", "Borders", "Dividers, table rules and outlines"],
  ["private", "Private Note", "Marks a comment the client cannot see"],
];
const STATUS_COLOURS: [ThemeKey, string, string][] = [
  ["amber", "Needs Attention", "Pending, revision requested, warnings"],
  ["green", "Approved", "Approved, published, positive change"],
  ["rose", "Rejected", "Rejections and destructive actions"],
  ["hl", "Copy Highlight", "Background behind highlighted copy"],
];

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5-5 5 5" />
      <path d="M12 5v13" />
    </svg>
  );
}

function PresetDots({ preset }: { preset: Partial<Theme> }) {
  const t = presetTheme(preset);
  return (
    <span className="dots2">
      <i style={{ background: t.action }} />
      <i style={{ background: t.rail }} />
      <i style={{ background: t.canvas, boxShadow: "inset 0 0 0 1px var(--line-2)" }} />
    </span>
  );
}

function Swatch({
  k,
  label,
  desc,
  value,
  disabled,
  onChange,
}: {
  k: ThemeKey;
  label: string;
  desc: string;
  value: string;
  disabled: boolean;
  onChange: (k: ThemeKey, v: string) => void;
}) {
  // The hex box keeps what's being typed until it's a valid colour.
  const [typed, setTyped] = useState(value);
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setTyped(value);
  }
  return (
    <div className="srow">
      <span className="sl">
        <b>{label}</b>
        <span>{desc}</span>
      </span>
      <span className="sw">
        <input
          type="color"
          aria-label={`${label} colour`}
          value={value.toLowerCase()}
          disabled={disabled}
          onChange={(e) => onChange(k, e.target.value.toUpperCase())}
        />
        <input
          type="text"
          aria-label={`${label} hex`}
          value={typed}
          disabled={disabled}
          maxLength={7}
          onChange={(e) => setTyped(e.target.value)}
          onBlur={() => (HEX.test(typed.trim()) ? onChange(k, typed.trim().toUpperCase()) : setTyped(value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
      </span>
    </div>
  );
}

// What used to be the single Branding page, now shown one part at a time
// across Settings → General and Customisation (direct instruction). Each
// page saves only its own part: the name, or the brand colours (the presets
// and every colour, together). The logo saves on its own, as before.
export type BrandPart = "name" | "logo" | "colours";

export function BrandForm({
  part,
  agencyId,
  agencyName,
  settings,
  canEdit,
  locked = false,
}: {
  part: BrandPart;
  agencyId: string;
  agencyName: string;
  settings: AgencySettingsRow | null;
  canEdit: boolean;
  // Not on this plan (phase41): the page says so, not the role note.
  locked?: boolean;
}) {
  const savedTheme = normaliseTheme(settings?.theme);
  const savedPresets = settings?.custom_presets ?? {};
  const [name, setName] = useState(agencyName);
  const [theme, setTheme] = useState<Theme>(savedTheme);
  const [presets, setPresets] = useState<Record<string, Partial<Theme>>>(savedPresets);
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetError, setPresetError] = useState<string | null>(null);
  const [cropping, setCropping] = useState<File | null>(null);
  const [logoProblem, setLogoProblem] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);

  const save = useSaveBranding(agencyId);
  const setLogo = useSetAgencyLogo(agencyId);
  const { data: logoUrls } = useAvatarUrls([settings?.logo_asset_id]);
  const logoUrl = settings?.logo_asset_id ? logoUrls?.[settings.logo_asset_id] : undefined;
  const setDraft = useThemeDraft((s) => s.setDraft);

  // Edits preview across the whole app while on this page; leaving it
  // without saving puts the saved theme back. Only for someone who can edit:
  // anyone else sees what AgencyTheme applies, which on a plan without
  // branding (phase41) is Frank's own look, not the saved one.
  useEffect(() => {
    setDraft(canEdit ? theme : null);
  }, [theme, setDraft, canEdit]);
  useEffect(() => () => setDraft(null), [setDraft]);

  const dirty =
    part === "name"
      ? name.trim() !== agencyName
      : part === "colours"
        ? !sameColours(theme, savedTheme) || !sameColours(presets, savedPresets)
        : false;
  const active = matchPreset(theme, { ...BUILT_IN_PRESETS, ...presets });

  function setColour(k: ThemeKey, v: string) {
    setTheme((t) => ({ ...t, [k]: v }));
    save.reset();
  }

  function addPreset() {
    const n = presetName.trim();
    if (!n) return setPresetError("Give the preset a name");
    if (BUILT_IN_PRESETS[n]) return setPresetError(`"${n}" is a built-in preset — pick another name`);
    setPresets((p) => ({ ...p, [n]: { ...theme } }));
    setSavingPreset(false);
    setPresetName("");
    setPresetError(null);
    save.reset();
  }

  return (
    <>
      {!canEdit && !locked && (
        <p className="sub" style={{ marginTop: 0 }}>
          Only Admins, Owners and the Primary Owner can change this.
        </p>
      )}

      {part === "name" && (
      <div className="panel">
        <div className="panel-h">
          <b>Account Name</b>
        </div>
        <div className="srow">
          <span className="sl">
            <b>Name</b>
            <span>Shown across Frank and to your clients</span>
          </span>
          <input
            className="bin one"
            aria-label="Agency name"
            style={{ width: 290 }}
            value={name}
            disabled={!canEdit}
            onChange={(e) => {
              setName(e.target.value);
              save.reset();
            }}
          />
        </div>
      </div>

      )}

      {part === "logo" && (
      <div className="panel">
        <div className="panel-h">
          <b>Logo</b>
          <span className="sync">PNG, JPG or WebP — cropped to a square</span>
        </div>
        <div className="logo-up">
          <button
            type="button"
            className={logoUrl ? "logo-box has" : "logo-box"}
            aria-label="Upload agency logo"
            disabled={!canEdit || setLogo.isPending}
            onClick={() => logoInput.current?.click()}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
              <img src={logoUrl} alt="" />
            ) : (
              <UploadIcon />
            )}
          </button>
          <span className="sl">
            <b>Agency Logo</b>
            <span>Shown in the sidebar and on the Share for Review pages your clients open</span>
          </span>
          {canEdit &&
            (logoUrl ? (
              <button type="button" className="btn sm" disabled={setLogo.isPending} onClick={() => setLogo.mutate(null)}>
                Remove
              </button>
            ) : (
              <button
                type="button"
                className="btn sm"
                disabled={setLogo.isPending}
                onClick={() => logoInput.current?.click()}
              >
                {setLogo.isPending ? "Uploading…" : "Upload"}
              </button>
            ))}
          <input
            ref={logoInput}
            type="file"
            accept={AVATAR_TYPES.join(",")}
            aria-label="Agency logo file"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const bad = validateAvatarSource(file);
              setLogoProblem(bad);
              if (!bad) setCropping(file);
            }}
          />
        </div>
        {(logoProblem || setLogo.error) && (
          <p className="autherr" style={{ padding: "0 15px 12px" }}>
            {logoProblem ?? errorMessage(setLogo.error, "Couldn't update the logo")}
          </p>
        )}
      </div>

      )}

      {part === "colours" && (
      <div className="panel">
        <div className="panel-h">
          <b>Colour Presets</b>
          <span className="sync">
            {dirty ? <span className="unsaved">Unsaved changes</span> : "Applies instantly across the app"}
          </span>
        </div>
        <div className="presets">
          {Object.entries(BUILT_IN_PRESETS).map(([n, p]) => (
            <button
              key={n}
              type="button"
              className="pre"
              aria-pressed={active === n}
              disabled={!canEdit}
              onClick={() => {
                setTheme(presetTheme(p));
                save.reset();
              }}
            >
              <PresetDots preset={p} />
              {n}
            </button>
          ))}
          {Object.entries(presets).map(([n, p]) => (
            <span
              key={n}
              className="pre custom"
              role="button"
              tabIndex={0}
              aria-pressed={active === n}
              onClick={() => {
                if (!canEdit) return;
                setTheme(presetTheme(p));
                save.reset();
              }}
            >
              <PresetDots preset={p} />
              {n}
              {canEdit && (
                <button
                  type="button"
                  className="prex"
                  title="Delete preset"
                  aria-label={`Delete preset ${n}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPresets((all) => {
                      const next = { ...all };
                      delete next[n];
                      return next;
                    });
                    save.reset();
                  }}
                >
                  ✕
                </button>
              )}
            </span>
          ))}
          {canEdit && (
            <button
              type="button"
              className={active ? "pre save" : "pre save hot"}
              onClick={() => {
                setPresetName("");
                setPresetError(null);
                setSavingPreset(true);
              }}
            >
              <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, stroke: "currentColor", fill: "none", strokeWidth: 2 }}>
                <path d="M12 5v14M5 12h14" />
              </svg>
              Save current as preset
            </button>
          )}
        </div>
      </div>

      )}

      {part === "colours" && (
      <>
      <div className="panel">
        <div className="panel-h">
          <b>Interface Colours</b>
        </div>
        {INTERFACE_COLOURS.map(([k, label, desc]) => (
          <Swatch key={k} k={k} label={label} desc={desc} value={theme[k]} disabled={!canEdit} onChange={setColour} />
        ))}
      </div>

      <div className="panel">
        <div className="panel-h">
          <b>Status Colours</b>
          <span className="sync">Used on tags, calendar and charts</span>
        </div>
        {STATUS_COLOURS.map(([k, label, desc]) => (
          <Swatch key={k} k={k} label={label} desc={desc} value={theme[k]} disabled={!canEdit} onChange={setColour} />
        ))}
      </div>
      </>
      )}

      {canEdit && part !== "logo" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 24 }}>
          <button
            type="button"
            className="btn primary"
            disabled={save.isPending || (part === "name" && !name.trim()) || !dirty}
            onClick={() =>
              save.mutate(
                part === "name"
                  ? { agencyName: name }
                  : { theme, customPresets: presets },
              )
            }
          >
            {save.isPending ? "Saving…" : "Save Changes"}
          </button>
          {part !== "name" && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setTheme({ ...DEFAULT_THEME });
                save.reset();
              }}
            >
              Reset to Default
            </button>
          )}
          {save.isSuccess && !dirty && (
            <span className="sub" role="status" style={{ margin: 0 }}>
              Saved
            </span>
          )}
          {save.error && <span className="autherr">{errorMessage(save.error, "Couldn't save")}</span>}
        </div>
      )}

      {savingPreset && (
        <Modal hideCloseButton
          title="Save Colour Preset"
          size="sm"
          onClose={() => setSavingPreset(false)}
          footer={
            <>
              <div className="grow" />
              <button type="button" className="btn" onClick={() => setSavingPreset(false)}>
                Cancel
              </button>
              <button type="button" className="btn primary" onClick={addPreset}>
                Save Preset
              </button>
            </>
          }
        >
          <div className="field">
            <label>Colours Being Saved</label>
            <div className="swgrid">
              {(["action", "rail", "canvas", "surface", "ink", "line", "amber", "green", "rose", "hl"] as ThemeKey[]).map(
                (k) => (
                  <i key={k} style={{ background: theme[k] }} title={k} />
                ),
              )}
            </div>
          </div>
          <div className="field">
            <label htmlFor="preName">Preset Name</label>
            <input
              id="preName"
              autoFocus
              placeholder="e.g. Kabir & Sons brand"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addPreset();
              }}
            />
          </div>
          {presetError && <p className="autherr">{presetError}</p>}
        </Modal>
      )}

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
  );
}
