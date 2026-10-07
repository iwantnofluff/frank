"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ClientChecklist } from "@/components/team/ClientChecklist";
import { InviteLinks } from "@/components/team/InviteLinks";
import { ProjectPicker } from "@/components/team/ProjectPicker";
import { useProjectsOfClients } from "@/hooks/use-projects";
import { useClients } from "@/hooks/use-clients";
import { useInviteMember, type SentInvite } from "@/hooks/use-invite-member";
import { useAddablePeople, useAddPersonToClient } from "@/hooks/use-add-to-client";
import { errorMessage } from "@/lib/errors";
import { INVITE_ROLE_HINTS, INVITE_ROLE_LABELS, type InviteRole } from "@/lib/roles";

// Inviting one person from Team → Users (phase44): their name, email and
// role — only the roles this person may give (rolesICanInvite) — then the
// link to share directly, as well as the email. Opened from a client, it
// also offers the team's Users who haven't got that client yet (phase62):
// picking one gives it to them straight away, with no invite. There,
// each add or invite comes back to the empty window, for the next person.
export function InviteMemberModal({
  agencyId,
  roles,
  presetClientId,
  onClose,
  onSent,
}: {
  agencyId: string;
  roles: InviteRole[];
  // Opened from a Client Profile (phase46): that client, chosen already.
  presetClientId?: string;
  onClose: () => void;
  onSent: (email: string) => void;
}) {
  const invite = useInviteMember();
  const { data: clients } = useClients();
  const activeClients = (clients ?? []).filter((c) => !c.archived_at);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>(roles.includes("user") ? "user" : roles[0]);
  const [clientIds, setClientIds] = useState<string[]>(presetClientId ? [presetClientId] : []);
  const [clientId, setClientId] = useState(presetClientId ?? "");
  const { data: addable, isPending: addableLoading } = useAddablePeople(presetClientId ?? "", !!presetClientId);
  const add = useAddPersonToClient(agencyId, presetClientId ?? "");
  const [existingId, setExistingId] = useState("");
  const existing = (addable ?? []).find((p) => p.userId === existingId) ?? null;
  // Their projects among their clients' (phase46); null, all of them.
  const [projectIds, setProjectIds] = useState<string[] | null>(null);
  const theirClients = existing
    ? [presetClientId!]
    : role === "client"
      ? clientId
        ? [clientId]
        : []
      : role === "user"
        ? clientIds
        : [];
  const { data: theirProjects } = useProjectsOfClients(theirClients);
  const projectGroups = activeClients
    .filter((c) => theirClients.includes(c.id))
    .map((c) => ({ name: c.name, projects: (theirProjects ?? []).filter((p) => p.client_id === c.id) }))
    .filter((g) => g.projects.length > 0);
  const [validation, setValidation] = useState<string | null>(null);
  const [sent, setSent] = useState<SentInvite | null>(null);
  // What was just done, shown when the window comes back for the next one.
  const [done, setDone] = useState<string | null>(null);
  const clientName = activeClients.find((c) => c.id === presetClientId)?.name ?? "this client";

  // Back to the empty window (opened from a client).
  function startAgain(note: string) {
    setFirstName("");
    setLastName("");
    setEmail("");
    setRole(roles.includes("user") ? "user" : roles[0]);
    setClientIds(presetClientId ? [presetClientId] : []);
    setClientId(presetClientId ?? "");
    setExistingId("");
    setProjectIds(null);
    setValidation(null);
    setSent(null);
    invite.reset();
    add.reset();
    setDone(note);
  }

  // Only what's still on offer, if their clients changed after choosing.
  function chosenProjects() {
    return projectIds === null || !projectGroups.length
      ? null
      : projectIds.filter((id) => projectGroups.some((g) => g.projects.some((p) => p.id === id)));
  }

  async function handleSubmit() {
    if (existing) {
      await add.mutateAsync({ userId: existing.userId, projectIds: chosenProjects() });
      onSent(existing.email);
      startAgain(`${existing.name} added to ${clientName}.`);
      return;
    }
    const trimmed = email.trim();
    if (!firstName.trim() || !lastName.trim()) return setValidation("Enter their first and last name");
    if (!trimmed || !trimmed.includes("@")) return setValidation("Enter a valid email");
    if (role === "client" && !clientId) return setValidation("Choose the client they're from");
    setValidation(null);
    setDone(null);
    const result = await invite.mutateAsync({
      agencyId,
      email: trimmed,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role,
      clientIds: role === "client" ? [clientId] : role === "user" ? clientIds : [],
      projectIds: chosenProjects(),
    });
    setSent(result);
    onSent(trimmed);
  }

  if (sent) {
    return (
      <Modal
        hideCloseButton
        title="Invite Sent"
        size="sm"
        onClose={onClose}
        footer={
          <button
            type="button"
            className="btn primary"
            onClick={presetClientId ? () => startAgain(`Invite sent to ${sent.name}.`) : onClose}
          >
            Done
          </button>
        }
      >
        <InviteLinks sent={[sent]} />
      </Modal>
    );
  }

  return (
    <Modal
      hideCloseButton
      title="Invite Team Member"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <span className="grow">
            {existing ? "They'll see this client next time they open Frank" : "Invite link expires in 48 hours"}
          </span>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={invite.isPending || add.isPending}
            onClick={() => handleSubmit().catch(() => {})}
          >
            {existing ? (add.isPending ? "Adding…" : "Add to Client") : invite.isPending ? "Sending…" : "Send Invite"}
          </button>
        </>
      }
    >
      {done && (
        <p className="note" role="status">
          {done}
        </p>
      )}
      {presetClientId && (
        <div className="field">
          <label htmlFor="ivExisting">A User on Your Team</label>
          <select
            id="ivExisting"
            value={existingId}
            disabled={!addable?.length}
            onChange={(e) => {
              setExistingId(e.target.value);
              setProjectIds(null);
              setValidation(null);
              setDone(null);
            }}
          >
            <option value="">
              {addableLoading
                ? "Frank is working…"
                : addable?.length
                  ? "No, someone new"
                  : "Every User on your team has this client"}
            </option>
            {(addable ?? []).map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.name}
              </option>
            ))}
          </select>
          {existing && (
            <div className="hint" style={{ marginTop: 5 }}>
              {existing.email}. Given this client straight away, with no invite: they&apos;re on your team already.
            </div>
          )}
        </div>
      )}
      {!existing && (
        <>
          <div className="frow">
            <div className="field">
              <label htmlFor="ivFirst">First Name</label>
              <input id="ivFirst" autoFocus value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ivLast">Last Name</label>
              <input id="ivLast" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="ivEmail">Email Address</label>
            <input
              id="ivEmail"
              type="email"
              placeholder="name@nofluff.in"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit().catch(() => {});
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="ivRole">Role</label>
            <select id="ivRole" value={role} onChange={(e) => setRole(e.target.value as InviteRole)}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {INVITE_ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <div className="hint" style={{ marginTop: 5 }}>
              {INVITE_ROLE_HINTS[role]}
            </div>
          </div>
          {role === "user" && (
            <div className="field">
              <label>Client Access</label>
              <ClientChecklist clients={activeClients} selected={clientIds} onChange={setClientIds} />
            </div>
          )}
          {role === "client" && (
            <div className="field">
              <label htmlFor="ivClient">Their Client</label>
              <select id="ivClient" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">Choose a client</option>
                {activeClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}
      {(existing || role === "user" || role === "client") && projectGroups.length > 0 && (
        <div className="field">
          <label htmlFor="ivProjects">Projects</label>
          <ProjectPicker id="ivProjects" groups={projectGroups} value={projectIds} onChange={setProjectIds} />
        </div>
      )}
      {validation && <p className="autherr">{validation}</p>}
      {!existing && invite.error && <p className="autherr">{errorMessage(invite.error, "Couldn't send the invite")}</p>}
      {existing && add.error && <p className="autherr">{errorMessage(add.error, "Couldn't add them to this client")}</p>}
    </Modal>
  );
}
