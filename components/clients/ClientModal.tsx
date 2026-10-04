"use client";

import { useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useCreateClient } from "@/hooks/use-create-client";
import { useUpdateClient } from "@/hooks/use-update-client";
import { useSaveClientLogo } from "@/hooks/use-client-logo";
import { useAvatarUrls } from "@/hooks/use-avatar-urls";
import { useMyAgency } from "@/hooks/use-my-agency";
import { useMyMembership } from "@/hooks/use-my-membership";
import { useTeamMembers } from "@/hooks/use-team-members";
import { useInviteMember, type SentInvite } from "@/hooks/use-invite-member";
import { InviteLinks } from "@/components/team/InviteLinks";
import { INVITE_ROLE_LABELS, rolesICanInvite, type InviteRole } from "@/lib/roles";
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

// Someone to invite to this client (phase44).
interface InviteDraft {
  firstName: string;
  lastName: string;
  email: string;
  role: InviteRole;
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
  const { data: agency } = useMyAgency();
  const clientLimit = agency?.clientLimit ?? null;
  // Inviting people to this client as it's saved (decided directly, phase44):
  // only the roles this person may give, and the plan's team places.
  const { data: me } = useMyMembership(props.agencyId);
  const inviteRoles = rolesICanInvite(me);
  const { data: team } = useTeamMembers(inviteRoles.length ? props.agencyId : undefined);
  const placesLeft =
    agency?.seatLimit == null ? null : Math.max(0, agency.seatLimit - (team ?? []).filter((m) => !m.removed_at).length);
  const inviteMember = useInviteMember();
  const [invites, setInvites] = useState<InviteDraft[]>([]);
  const [sent, setSent] = useState<SentInvite[] | null>(null);
  const [inviteErrors, setInviteErrors] = useState<string[]>([]);
  const isCreate = props.mode === "create";
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
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

  const [name, setName] = useState(isCreate ? "" : props.currentName);
  const [industry, setIndustry] = useState(isCreate ? "" : (props.currentIndustry ?? ""));
  const [description, setDescription] = useState(isCreate ? "" : (props.currentDescription ?? ""));
  const [nameError, setNameError] = useState<string | null>(null);

  function updateInvite(i: number, patch: Partial<InviteDraft>) {
    setInvites((prev) => prev.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  }

  // Each person in turn, once the client exists. A failed invite doesn't
  // undo the client or the others; it's listed with the links.
  async function sendInvites(clientId: string) {
    const ready = invites.filter((v) => v.email.trim());
    if (!ready.length) return false;
    const done: SentInvite[] = [];
    const failed: string[] = [];
    for (const v of ready) {
      try {
        done.push(
          await inviteMember.mutateAsync({
            agencyId: props.agencyId,
            email: v.email.trim(),
            firstName: v.firstName.trim(),
            lastName: v.lastName.trim(),
            role: v.role,
            // A User gets this client; a Client is from it; Owners and
            // Admins see every client already.
            clientIds: v.role === "user" || v.role === "client" ? [clientId] : [],
          }),
        );
      } catch (e) {
        failed.push(`${v.email.trim()}: ${errorMessage(e, "Couldn't send the invite")}`);
      }
    }
    setSent(done);
    setInviteErrors(failed);
    return true;
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setNameError("Give the client a name.");
      return;
    }
    const incomplete = invites.find((v) => v.email.trim() && (!v.firstName.trim() || !v.lastName.trim()));
    if (incomplete) {
      setNameError(`Give ${incomplete.email.trim()} a first and last name, or remove them.`);
      return;
    }
    setNameError(null);
    let savedClientId: string;

    if (props.mode === "create") {
      const created = await createClient.mutateAsync({
        agencyId: props.agencyId,
        name: name.trim(),
        industry: industry.trim(),
        description,
      });
      savedClientId = created.id;
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
      if (logoFile) {
        await saveLogo.mutateAsync({ agencyId: props.agencyId, clientId: props.clientId, file: logoFile });
      } else if (logoRemoved && currentLogoId) {
        await saveLogo.mutateAsync({ agencyId: props.agencyId, clientId: props.clientId, file: null });
      }
      savedClientId = props.clientId;
    }
    // With invites, stay open on their links; otherwise done.
    if (!(await sendInvites(savedClientId))) props.onClose();
  }

  const isPending =
    createClient.isPending ||
    updateClient.isPending ||
    saveLogo.isPending ||
    inviteMember.isPending;
  const submitError = createClient.error
    ? errorMessage(createClient.error, "Couldn't create the client")
    : updateClient.error
      ? errorMessage(updateClient.error, "Couldn't save the client")
      : saveLogo.error
        ? errorMessage(saveLogo.error, "Couldn't save the client's image")
        : null;

  if (sent) {
    return (
      <Modal
        hideCloseButton
        title={isCreate ? "Client Created" : "Client Saved"}
        onClose={props.onClose}
        footer={
          <button type="button" className="btn primary" onClick={props.onClose}>
            Done
          </button>
        }
      >
        {sent.length > 0 && <InviteLinks sent={sent} />}
        {inviteErrors.length > 0 && (
          <div className="note warn" style={{ marginTop: 12 }}>
            <div>
              {inviteErrors.length === 1 ? "This invite wasn't sent:" : "These invites weren't sent:"}
              <ul className="confirm-list">
                {inviteErrors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
              The client is saved either way; invite them again from Settings → Team.
            </div>
          </div>
        )}
      </Modal>
    );
  }

  return (
    <>
    <Modal hideCloseButton
      title={isCreate ? "New Client" : "Edit Client"}
      onClose={props.onClose}
      footer={
        <>
          {isCreate ? (
            <span className="grow">
              {clientLimit === null
                ? `${props.activeClientCount} active client${props.activeClientCount === 1 ? "" : "s"}`
                : `${props.activeClientCount} of ${clientLimit} clients used`}
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

      {inviteRoles.length > 0 && (
        <div className="field">
          <label>
            Invite People <span className="hint">optional</span>
          </label>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 8 }}>
            They&rsquo;re emailed a link to join, and you&rsquo;ll get the links to share too. Owners and Admins see
            every client; a User gets this one; a Client is from it and sees only its public comments.
            {placesLeft !== null &&
              ` ${placesLeft} team place${placesLeft === 1 ? "" : "s"} left on your plan; Clients don't use one.`}
          </div>
          {invites.map((v, i) => (
            <div className="brow" key={i}>
              <div className="brow-h">
                <div className="invrow">
                  <input
                    value={v.firstName}
                    onChange={(e) => updateInvite(i, { firstName: e.target.value })}
                    placeholder="First name"
                    aria-label="First name"
                  />
                  <input
                    value={v.lastName}
                    onChange={(e) => updateInvite(i, { lastName: e.target.value })}
                    placeholder="Last name"
                    aria-label="Last name"
                  />
                  <input
                    value={v.email}
                    onChange={(e) => updateInvite(i, { email: e.target.value })}
                    placeholder="Email"
                    type="email"
                    aria-label="Email"
                  />
                  <select
                    value={v.role}
                    onChange={(e) => updateInvite(i, { role: e.target.value as InviteRole })}
                    aria-label="Role"
                  >
                    {inviteRoles.map((r) => (
                      <option key={r} value={r}>
                        {INVITE_ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="brx"
                  title="Remove"
                  onClick={() => setInvites((prev) => prev.filter((_, j) => j !== i))}
                >
                  <RemoveIcon />
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="badd"
            onClick={() => setInvites((prev) => [...prev, { firstName: "", lastName: "", email: "", role: "user" }])}
          >
            + Invite someone
          </button>
        </div>
      )}

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
