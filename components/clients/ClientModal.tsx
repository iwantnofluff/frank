"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useCreateClient } from "@/hooks/use-create-client";
import { useUpdateClient } from "@/hooks/use-update-client";
import { useClientContacts } from "@/hooks/use-client-contacts";
import { useSetClientContacts } from "@/hooks/use-set-client-contacts";
import { useSaveClientLogo } from "@/hooks/use-client-logo";
import { useAvatarUrls } from "@/hooks/use-avatar-urls";
import { useMyAgency } from "@/hooks/use-my-agency";
import { PhotoCropModal } from "@/components/profile/PhotoCropModal";
import { AVATAR_TYPES, validateAvatarSource } from "@/lib/upload-avatar";
import { errorMessage } from "@/lib/errors";

function RemoveIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

interface ContactDraft {
  name: string;
  email: string;
}

// Replaces NewClientModal.tsx + RenameClientModal.tsx — the "..." row menu's
// Edit action now opens the same modal shape a New Client does (direct
// instruction), pre-filled, rather than a stripped-down name-only form.
// mode: "create" | "edit" mirrors CreativeModal.tsx's own precedent for the
// same reason: one modal, two entry points, most of the fields identical.
type ClientModalProps =
  | {
      mode: "create";
      agencyId: string;
      activeClientCount: number;
      onClose: () => void;
    }
  | {
      mode: "edit";
      agencyId: string;
      clientId: string;
      currentName: string;
      currentIndustry: string | null;
      currentLogoAssetId: string | null;
      currentDescription: string | null;
      onClose: () => void;
    };

export function ClientModal(props: ClientModalProps) {
  // The agency's plan limit (phase37), which the database enforces.
  const clientLimit = useMyAgency().data?.clientLimit ?? 10;
  const isCreate = props.mode === "create";
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const setContacts = useSetClientContacts();
  const saveLogo = useSaveClientLogo();
  const currentLogoId = isCreate ? null : props.currentLogoAssetId;
  const { data: logoUrls } = useAvatarUrls([currentLogoId]);
  const logoInput = useRef<HTMLInputElement>(null);
  // A picked image goes through the same cropper as profile photos (minus
  // face detection); only the cropped 512px square is kept and uploaded.
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [cropping, setCropping] = useState<File | null>(null);
  const shownLogo = logoPreview ?? (!logoRemoved && currentLogoId ? (logoUrls?.[currentLogoId] ?? null) : null);

  function pickLogo(file: File) {
    const bad = validateAvatarSource(file);
    setLogoError(bad);
    if (!bad) setCropping(file);
  }

  function applyCroppedLogo(cropped: File) {
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoFile(cropped);
    setLogoPreview(URL.createObjectURL(cropped));
    setLogoRemoved(false);
    setCropping(null);
  }

  function clearLogo() {
    if (logoPreview) URL.revokeObjectURL(logoPreview);
    setLogoFile(null);
    setLogoPreview(null);
    setLogoRemoved(true);
  }
  const { data: existingContacts } = useClientContacts(isCreate ? undefined : props.clientId);

  const [name, setName] = useState(isCreate ? "" : props.currentName);
  const [industry, setIndustry] = useState(isCreate ? "" : (props.currentIndustry ?? ""));
  const [description, setDescription] = useState(isCreate ? "" : (props.currentDescription ?? ""));
  const [contacts, setContactsDraft] = useState<ContactDraft[]>([]);
  const [nameError, setNameError] = useState<string | null>(null);
  const [seededContacts, setSeededContacts] = useState(false);

  // Pre-fills once the edit modal's own current contacts arrive. Adjusting
  // state directly during render (not inside an effect) — React's own
  // documented pattern for "seed local state from a query result the first
  // time it appears" — guarded so it only ever fires once per modal
  // instance, which never outlives one open/close.
  if (!isCreate && existingContacts && !seededContacts) {
    setSeededContacts(true);
    setContactsDraft(existingContacts.map((c) => ({ name: c.name, email: c.email })));
  }

  function updateContact(i: number, patch: Partial<ContactDraft>) {
    setContactsDraft((prev) => prev.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setNameError("Give the client a name.");
      return;
    }
    setNameError(null);

    if (props.mode === "create") {
      const created = await createClient.mutateAsync({
        agencyId: props.agencyId,
        name: name.trim(),
        industry: industry.trim(),
        description,
      });
      if (contacts.some((c) => c.name.trim() && c.email.trim())) {
        await setContacts.mutateAsync({ clientId: created.id, agencyId: props.agencyId, contacts });
      }
      if (logoFile) {
        await saveLogo.mutateAsync({ agencyId: props.agencyId, clientId: created.id, file: logoFile });
      }
    } else {
      await updateClient.mutateAsync({
        clientId: props.clientId,
        name: name.trim(),
        industry: industry.trim(),
        description,
      });
      await setContacts.mutateAsync({ clientId: props.clientId, agencyId: props.agencyId, contacts });
      if (logoFile) {
        await saveLogo.mutateAsync({ agencyId: props.agencyId, clientId: props.clientId, file: logoFile });
      } else if (logoRemoved && currentLogoId) {
        await saveLogo.mutateAsync({ agencyId: props.agencyId, clientId: props.clientId, file: null });
      }
    }
    props.onClose();
  }

  const isPending =
    createClient.isPending || updateClient.isPending || setContacts.isPending || saveLogo.isPending;
  const submitError = createClient.error
    ? errorMessage(createClient.error, "Couldn't create the client")
    : updateClient.error
      ? errorMessage(updateClient.error, "Couldn't save the client")
      : setContacts.error
        ? errorMessage(setContacts.error, "Couldn't save the Client Team list")
        : saveLogo.error
          ? errorMessage(saveLogo.error, "Couldn't save the client's image")
          : null;

  return (
    <>
    <Modal hideCloseButton
      title={isCreate ? "New Client" : "Edit Client"}
      onClose={props.onClose}
      footer={
        <>
          {isCreate ? (
            <span className="grow">
              {props.activeClientCount} of {clientLimit} clients used
            </span>
          ) : (
            <span className="grow" />
          )}
          <button type="button" className="btn" onClick={props.onClose}>
            Cancel
          </button>
          <button type="button" className="btn primary" disabled={isPending} onClick={handleSubmit}>
            {isPending ? "Saving…" : isCreate ? "Create Client" : "Save"}
          </button>
        </>
      }
    >
      <div className="field">
        <label>
          Profile Image <span className="hint">optional</span>
        </label>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="logo clogo" style={shownLogo ? undefined : { background: "var(--line-2)", color: "var(--muted)" }}>
            {shownLogo ? (
              // eslint-disable-next-line @next/next/no-img-element -- local preview or short-lived signed URL
              <img src={shownLogo} alt="" />
            ) : (
              (name.trim() || "?").slice(0, 2).toUpperCase()
            )}
          </div>
          <button type="button" className="btn sm" onClick={() => logoInput.current?.click()}>
            {shownLogo ? "Change image" : "Upload image"}
          </button>
          {shownLogo && (
            <button type="button" className="btn sm" onClick={clearLogo}>
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
              if (file) pickLogo(file);
            }}
          />
        </div>
        {logoError && <p className="autherr">{logoError}</p>}
      </div>

      <div className="field">
        <label htmlFor="cName">Client Name</label>
        <input
          id="cName"
          value={name}
          autoFocus
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError(null);
          }}
          placeholder="e.g. Lotus Skincare"
        />
        {nameError && <p className="autherr">{nameError}</p>}
      </div>

      <div className="field">
        <label htmlFor="cInd">
          Industry <span className="hint">optional</span>
        </label>
        <input
          id="cInd"
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder="e.g. D2C beauty"
        />
      </div>

      <div className="field">
        <label htmlFor="cDesc">
          Description <span className="hint">optional, {description.length}/500</span>
        </label>
        <textarea
          id="cDesc"
          rows={3}
          maxLength={500}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Who they are and what we do for them"
        />
      </div>

      <div className="field">
        <label>
          Client Team <span className="hint">optional</span>
        </label>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 8 }}>
          People at this client who review and approve work. They&rsquo;ll pick their own name from
          this list when commenting or approving on a shared link.
        </div>
        {contacts.map((c, i) => (
          <div className="brow" key={i}>
            <div className="brow-h">
              <div className="frow" style={{ flex: 1 }}>
                <input
                  value={c.name}
                  onChange={(e) => updateContact(i, { name: e.target.value })}
                  placeholder="Name"
                />
                <input
                  value={c.email}
                  onChange={(e) => updateContact(i, { email: e.target.value })}
                  placeholder="Email"
                  type="email"
                />
              </div>
              <button
                type="button"
                className="brx"
                title="Remove"
                onClick={() => setContactsDraft((prev) => prev.filter((_, j) => j !== i))}
              >
                <RemoveIcon />
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="badd"
          onClick={() => setContactsDraft((prev) => [...prev, { name: "", email: "" }])}
        >
          + Add person
        </button>
      </div>

      {submitError && <p className="autherr">{submitError}</p>}
    </Modal>
    {/* A sibling of the client modal, not inside it: a fixed overlay nested
        in an animating (transformed) modal would be positioned within it. */}
    {cropping && (
      <PhotoCropModal
        file={cropping}
        detectFaces={false}
        title="Position the client's image"
        onCancel={() => setCropping(null)}
        onConfirm={applyCroppedLogo}
      />
    )}
    </>
  );
}
