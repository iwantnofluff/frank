"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAvatarUrls } from "@/hooks/use-avatar-urls";
import { PhotoCropModal } from "@/components/profile/PhotoCropModal";
import { AVATAR_TYPES, validateAvatarSource } from "@/lib/upload-avatar";

// A client's image, name, industry and description, as New Client and the
// Client Profile (phase48) both edit them.
export function useClientDraft(initial: {
  name: string;
  industry: string | null;
  description: string | null;
  logoAssetId: string | null;
}) {
  const [name, setName] = useState(initial.name);
  const [industry, setIndustry] = useState(initial.industry ?? "");
  const [description, setDescription] = useState(initial.description ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const { data: logoUrls } = useAvatarUrls([initial.logoAssetId]);
  // A picked image goes through the same cropper as profile photos (minus
  // face detection); only the cropped 512px square is kept and uploaded.
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [cropping, setCropping] = useState<File | null>(null);
  const shownLogo =
    logoPreview ?? (!logoRemoved && initial.logoAssetId ? (logoUrls?.[initial.logoAssetId] ?? null) : null);

  return {
    name,
    setName,
    industry,
    setIndustry,
    description,
    setDescription,
    nameError,
    setNameError,
    logoFile,
    // The image was taken away (and there was one to take).
    logoRemoved: logoRemoved && !!initial.logoAssetId,
    logoError,
    shownLogo,
    cropping,
    setCropping,
    pickLogo(file: File) {
      const bad = validateAvatarSource(file);
      setLogoError(bad);
      if (!bad) setCropping(file);
    },
    applyCroppedLogo(cropped: File) {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
      setLogoFile(cropped);
      setLogoPreview(URL.createObjectURL(cropped));
      setLogoRemoved(false);
      setCropping(null);
    },
    clearLogo() {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
      setLogoFile(null);
      setLogoPreview(null);
      setLogoRemoved(true);
    },
  };
}

export type ClientDraft = ReturnType<typeof useClientDraft>;

export function ClientDetailsFields({ draft }: { draft: ClientDraft }) {
  const logoInput = useRef<HTMLInputElement>(null);
  return (
    <>
      <div className="field">
        <label>
          Profile Image <span className="hint">optional</span>
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            className="logo clogo"
            style={draft.shownLogo ? undefined : { background: "var(--line-2)", color: "var(--muted)" }}
          >
            {draft.shownLogo ? (
              // eslint-disable-next-line @next/next/no-img-element -- local preview or short-lived signed URL
              <img src={draft.shownLogo} alt="" />
            ) : (
              (draft.name.trim() || "?").slice(0, 2).toUpperCase()
            )}
          </div>
          <button type="button" className="btn sm" onClick={() => logoInput.current?.click()}>
            {draft.shownLogo ? "Change image" : "Upload image"}
          </button>
          {draft.shownLogo && (
            <button type="button" className="btn sm" onClick={draft.clearLogo}>
              Remove
            </button>
          )}
          <input
            ref={logoInput}
            type="file"
            accept={AVATAR_TYPES.join(",")}
            aria-label="Client profile image"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) draft.pickLogo(file);
            }}
          />
        </div>
        {draft.logoError && <p className="autherr">{draft.logoError}</p>}
      </div>

      <div className="field">
        <label htmlFor="cName">Client Name</label>
        <input
          id="cName"
          value={draft.name}
          autoFocus
          onChange={(e) => {
            draft.setName(e.target.value);
            if (draft.nameError) draft.setNameError(null);
          }}
          placeholder="e.g. Lotus Skincare"
        />
        {draft.nameError && <p className="autherr">{draft.nameError}</p>}
      </div>

      <div className="field">
        <label htmlFor="cInd">
          Industry <span className="hint">optional</span>
        </label>
        <input
          id="cInd"
          value={draft.industry}
          onChange={(e) => draft.setIndustry(e.target.value)}
          placeholder="e.g. D2C beauty"
        />
      </div>

      <div className="field">
        <label htmlFor="cDesc">
          Description <span className="hint">optional, {draft.description.length}/500</span>
        </label>
        <textarea
          id="cDesc"
          rows={3}
          maxLength={500}
          value={draft.description}
          onChange={(e) => draft.setDescription(e.target.value)}
          placeholder="Who they are and what we do for them"
        />
      </div>
    </>
  );
}

// Portalled to the page, not inside the window holding the fields: a fixed
// overlay nested in an animating (transformed) modal would be positioned
// within it.
export function ClientLogoCropper({ draft }: { draft: ClientDraft }) {
  if (!draft.cropping) return null;
  return createPortal(
    <PhotoCropModal
      file={draft.cropping}
      detectFaces={false}
      title="Position the client's image"
      onCancel={() => draft.setCropping(null)}
      onConfirm={draft.applyCroppedLogo}
    />,
    document.body,
  );
}
