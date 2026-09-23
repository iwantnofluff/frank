"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { useCreateProject } from "@/hooks/use-create-project";
import { PROJECT_TYPE_OPTS } from "@/lib/project-types";
import { errorMessage } from "@/lib/errors";

type Delivery = "scheduled" | "continuous";

// Ports frank-prototype.html's #newScrim/#newProjBtn2 (New Project, not the
// New Brief modal — that's #briefScrim/NewBriefModal.tsx, a different
// scrim). On create, the prototype opens the new project's calendar
// (openProject) — this app's equivalent landing spot is the project page
// itself, so navigates there the same way.
export function NewProjectModal({
  clientId,
  onClose,
}: {
  clientId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const createProject = useCreateProject();

  const [name, setName] = useState("");
  const [delivery, setDelivery] = useState<Delivery>("scheduled");
  const [type, setType] = useState(PROJECT_TYPE_OPTS.scheduled[0]);
  const [nameError, setNameError] = useState<string | null>(null);

  function handleDeliveryChange(next: Delivery) {
    setDelivery(next);
    setType(PROJECT_TYPE_OPTS[next][0]);
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setNameError("Give it a name first.");
      return;
    }
    setNameError(null);

    const project = await createProject.mutateAsync({
      clientId,
      name: name.trim(),
      type,
      delivery,
    });
    onClose();
    router.push(`/projects/${project.id}`);
  }

  const submitError = createProject.error
    ? errorMessage(createProject.error, "Couldn't create the project")
    : null;

  return (
    <Modal
      title="New Project"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <div className="grow" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={createProject.isPending}
            onClick={handleSubmit}
          >
            {createProject.isPending ? "Creating…" : "Create"}
          </button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="newName">Project name</label>
        <input
          id="newName"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (nameError) setNameError(null);
          }}
          placeholder={
            delivery === "scheduled" ? "e.g. Social Media Management" : "e.g. Amazon A+"
          }
        />
        {nameError && <p className="autherr">{nameError}</p>}
      </div>

      <div className="field">
        <label htmlFor="newType">Type</label>
        <select id="newType" value={type} onChange={(e) => setType(e.target.value)}>
          {PROJECT_TYPE_OPTS[delivery].map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>How does this work get delivered?</label>
        <div className="kindpick">
          <button
            type="button"
            className="kopt"
            aria-pressed={delivery === "scheduled"}
            onClick={() => handleDeliveryChange("scheduled")}
          >
            <span className="kic">
              <svg viewBox="0 0 24 24">
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M3 10h18M8 3v4M16 3v4" />
              </svg>
            </span>
            <span className="kt">
              <b>Scheduled</b>
              <span>
                Goes live on a date. You get Week, Month and Calendar views with a publish date
                on every piece.
              </span>
              <span className="keg">Social media · Paid campaigns</span>
            </span>
          </button>
          <button
            type="button"
            className="kopt"
            aria-pressed={delivery === "continuous"}
            onClick={() => handleDeliveryChange("continuous")}
          >
            <span className="kic">
              <svg viewBox="0 0 24 24">
                <path d="M4 6h16M4 12h16M4 18h10" />
                <path d="M17 16l2 2 4-4" />
              </svg>
            </span>
            <span className="kt">
              <b>Continuous</b>
              <span>
                Approved then handed over. You get a list ordered by what is due, with a
                destination instead of a date.
              </span>
              <span className="keg">Amazon A+ · Website · Emailers · Print and events</span>
            </span>
          </button>
        </div>
      </div>

      {submitError && <p className="autherr">{submitError}</p>}
    </Modal>
  );
}
