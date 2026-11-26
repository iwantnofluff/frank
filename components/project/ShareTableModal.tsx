"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useClientPeople } from "@/hooks/use-project-access";
import { MessagePreview } from "@/components/creative-review/MessagePreview";
import { tableMessage, type TableMessageKind } from "@/lib/table-message";

// As the review link's Share window offers them (direct instruction), in
// the order asked for.
const COPY_OPTIONS: { kind: TableMessageKind; label: string }[] = [
  { kind: "instructions", label: "Link + Instructions" },
  { kind: "review", label: "Link + Review" },
  { kind: "link", label: "Just Link" },
];
const COPIED_NOTE: Record<TableMessageKind, string> = {
  instructions: "Link and instructions",
  review: "Link and review message",
  link: "Link",
};

// Share the Table (direct instruction): its own address, for clients who
// sign in to see it. It needs no link of its own: the Table already asks
// anyone signed out to sign in, then opens only for people on the project.
// Owners and Admins also see which of the client's people can open it.
export function ShareTableModal({
  projectId,
  projectName,
  planner,
  clientId,
  clientName,
  isAdmin,
  onClose,
}: {
  projectId: string;
  projectName: string;
  planner: boolean;
  clientId: string;
  clientName: string;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const url = `${window.location.origin}/projects/${projectId}`;
  const [copied, setCopied] = useState<{ kind: TableMessageKind; ok: boolean } | null>(null);
  const [previewing, setPreviewing] = useState<{ kind: TableMessageKind; rect: DOMRect } | null>(null);
  const message = (kind: TableMessageKind) => tableMessage({ kind, projectName, planner, link: url });
  const { data: people, isLoading } = useClientPeople(clientId, isAdmin);
  const onProject = (people ?? []).filter((p) => p.kind === "client" && p.projectIds.includes(projectId));

  return (
    <>
    <Modal
      title="Share Table"
      size="sm"
      onClose={onClose}
      footer={
        <button type="button" className="btn primary" onClick={onClose}>
          Done
        </button>
      }
    >
      <p className="msection-d">For clients who sign in to Frank. Anyone else is asked to sign in, and only people on this project can open it.</p>
      <div className="field">
        <label>Link</label>
        <div className="linkrow">
          <code>{url}</code>
        </div>
      </div>
      <div className="field">
        <label>Copy and send</label>
        <div className="sharecopy">
          {COPY_OPTIONS.map((opt) => {
            const done = copied?.kind === opt.kind && copied.ok;
            return (
              <button
                key={opt.kind}
                type="button"
                className={done ? "btn sm copied" : "btn sm"}
                disabled={done}
                onMouseEnter={(e) => setPreviewing({ kind: opt.kind, rect: e.currentTarget.getBoundingClientRect() })}
                onMouseLeave={() => setPreviewing(null)}
                onFocus={(e) => setPreviewing({ kind: opt.kind, rect: e.currentTarget.getBoundingClientRect() })}
                onBlur={() => setPreviewing(null)}
                onClick={() =>
                  navigator.clipboard.writeText(message(opt.kind)).then(
                    () => setCopied({ kind: opt.kind, ok: true }),
                    () => setCopied({ kind: opt.kind, ok: false }),
                  )
                }
              >
                {done ? "Copied" : opt.label}
              </button>
            );
          })}
        </div>
        {copied?.ok && (
          <span className="bsaved" role="status">
            {COPIED_NOTE[copied.kind]} copied. Paste it wherever you&apos;re sending it.
          </span>
        )}
        {copied && !copied.ok && (
          <span className="berr" role="status">
            Couldn&apos;t copy it here. Select the link above and copy it.
          </span>
        )}
      </div>
      {isAdmin && (
        <div className="field">
          <label>Who at {clientName} can open it</label>
          {isLoading ? (
            <p className="sub">Frank is working…</p>
          ) : onProject.length ? (
            <ul className="sharepeople">
              {onProject.map((p) => (
                <li key={p.membershipId}>
                  <b>{p.name}</b>
                  <span>{p.accepted ? p.email : `${p.email}, invited`}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sub">Nobody from {clientName} is on this project yet. Add them in the client&apos;s Settings, under People.</p>
          )}
        </div>
      )}
    </Modal>
    {previewing && <MessagePreview text={message(previewing.kind)} anchorRect={previewing.rect} />}
    </>
  );
}
